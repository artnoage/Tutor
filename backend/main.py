from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import logging
from pydantic import BaseModel
from utils import *
import base64
from dotenv import load_dotenv
from agents import partner_chat
from agents import *
from logging_utilities import *
from typing import List, Dict
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
import uvicorn
import asyncio



# Load environment variables
load_dotenv()

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)




class MessageDict(BaseModel):
    type: str
    content: str

    def dict(self):
        return {"type": self.type, "content": self.content}

class ChatObject(BaseModel):
    chat_history: List[MessageDict]
    tutors_comments: List[str]
    summary: List[str]

    def dict(self):
        return {
            "chat_history": [msg.dict() for msg in self.chat_history],
            "tutors_comments": self.tutors_comments,
            "summary": self.summary
        }

class AudioData(BaseModel):
    motherTongue: str
    tutoringLanguage: str
    tutorsLanguage: str
    tutorsVoice: str
    partnersVoice: str
    interventionLevel: str
    chatObject: ChatObject
    disableTutor: bool

class FormattedConversation(BaseModel):
    formatted_text: str

def message_to_dict(message: BaseMessage) -> Dict:
    return {"type": message.__class__.__name__, "content": message.content}

def dict_to_message(message_dict: Dict) -> BaseMessage:
    if message_dict["type"] == "HumanMessage":
        return HumanMessage(content=message_dict["content"])
    elif message_dict["type"] == "AIMessage":
        return AIMessage(content=message_dict["content"])
    else:
        raise ValueError(f"Unknown message type: {message_dict['type']}")

@app.get("/")
async def root():
    return {"message": "Welcome to the audio analysis API"}

# Add this mapping at the beginning of your file or in a constants section

INTERVENTION_LEVEL_MAP = {
    "no": 0,
    "low": 1,
    "medium": 2,
    "high": 3
}

@app.post("/process_audio")
async def process_audio(
    audio: UploadFile = File(...),
    data: str = Form(...),
    groq_api_key: str = Form(None),
    openai_api_key: str = Form(None)
):
    try:
        logger.info("Starting process_audio function")
        audio_data = AudioData.model_validate_json(data)
        
        # Log the received data
        log_audio_data(audio_data, audio.filename)
        log_api_key_status()
        
        # Read the audio file
        audio_content = await audio.read()
        learning_language = language_to_code(audio_data.tutoringLanguage)
        logger.info(f"Learning language code: {learning_language}")
        
        # Transcribe the audio using Groq API
        logger.info("Starting audio transcription")
        transcription = transcribe_audio(audio_content, learning_language, groq_api_key)
        logger.info(f"Transcription: {transcription}")
        
        # Convert MessageDict objects to BaseMessage objects
        logger.info("Converting chat history")
        chat_history = [dict_to_message(msg.model_dump()) for msg in audio_data.chatObject.chat_history]
        logger.info(f"Converted chat history: {chat_history}")
        wrapped_transcription = HumanMessage(content=transcription)
        chat_history.append(wrapped_transcription)

        # Use the partner_chat function to get a response
        logger.info("Starting partner_chat task")
        partner_task = asyncio.create_task(partner_chat(
            audio_data.tutoringLanguage,
            chat_history,
            audio_data.disableTutor
        ))
        
        logger.info("Starting tutor_chat task")
        tutor_task = asyncio.create_task(tutor_chat(
            audio_data.tutoringLanguage,
            audio_data.tutorsLanguage,
            chat_history
        ))
        
        logger.info("Awaiting partner_chat and tutor_chat tasks")
        (response, updated_chat_history), tutor_feedback = await asyncio.gather(partner_task, tutor_task)

        logger.info(f"Partner response: {response.content}")
        logger.info(f"Tutor feedback: {tutor_feedback}")
        
        async def generate_audio(text, voice):
            logger.info(f"Generating audio for voice: {voice}")
            return await asyncio.to_thread(generate_tts, text, openai_api_key, voice)

        audio_generation_tasks = []
        audio_order = []

        # Convert string levels to numeric values
        tutor_intervention_level = INTERVENTION_LEVEL_MAP[tutor_feedback["intervene"]]
        required_intervention_level = INTERVENTION_LEVEL_MAP[audio_data.interventionLevel]

        # Prepare tutor feedback string
        tutors_comments_string = f"Comment: {tutor_feedback['comments']}\nCorrection: {tutor_feedback['correction']}"

        if not audio_data.disableTutor and (3-tutor_intervention_level) < required_intervention_level:
            logger.info(f"Tutor intervention enabled. Level: {tutor_feedback['intervene']}")
            audio_generation_tasks.extend([
                generate_audio(tutor_feedback["comments"], audio_data.tutorsVoice),
                generate_audio(tutor_feedback["correction"], audio_data.tutorsVoice),
                generate_audio(response.content, audio_data.partnersVoice)
            ])
            audio_order = ["tutor_comments", "tutor_correction", "partner_response"]
        else:
            logger.info(f"Tutor intervention disabled or not needed. Level: {tutor_feedback['intervene']}")
            audio_generation_tasks.append(generate_audio(response.content, audio_data.partnersVoice))
            audio_order = ["partner_response"]

        # Add summarizer task
        logger.info("Starting summarizer task")
        previous_summary = audio_data.chatObject.summary[-1] if audio_data.chatObject.summary else ""
        summarizer_task = summarize_conversation(
            audio_data.tutoringLanguage,
            updated_chat_history,
            previous_summary
        )

        # Gather all tasks
        logger.info("Gathering all tasks")
        all_results = await asyncio.gather(*audio_generation_tasks, summarizer_task)

        # Separate audio results and summary
        audio_results = all_results[:-1]
        updated_summary = all_results[-1]

        audio_dict = dict(zip(audio_order, audio_results))

        # Concatenate audio data in the correct order
        logger.info("Concatenating audio data")
        audio_data_list = [audio_dict[key] for key in audio_order]
        concatenated_audio = b''.join(audio_data_list)
        audio_base64 = base64.b64encode(concatenated_audio).decode('utf-8')

        logger.info(f"Updated summary: {updated_summary}")

        # Convert BaseMessage objects back to MessageDict objects
        logger.info("Updating chat object")
        updated_chat_object = audio_data.chatObject.model_dump()
        updated_chat_object['chat_history'] = [
            MessageDict(**message_to_dict(msg)).model_dump() for msg in updated_chat_history
        ]
        updated_chat_object['summary'].append(updated_summary)
        updated_chat_object['tutors_comments'].append(tutors_comments_string)

        logger.info(f"Tutors comments: {updated_chat_object['tutors_comments']}")


        # Single return statement
        logger.info("Returning response")
        return JSONResponse({
            "audio_base64": audio_base64,
            "chatObject": updated_chat_object
        })

    except Exception as e:
        logger.error(f"An error occurred: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))




if __name__ == "__main__":
    
    async def run_server():
        config = uvicorn.Config(app, host="0.0.0.0", port=8080)
        server = uvicorn.Server(config)
        await server.serve()

    logger.info("Starting the FastAPI application")
    try:
        asyncio.run(run_server())
    except KeyboardInterrupt:
        logger.info("Application stopped by user (KeyboardInterrupt)")
    except asyncio.exceptions.CancelledError:
        logger.info("Application tasks cancelled")
    except Exception as e:
        logger.error(f"An unexpected error occurred: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
    finally:
        logger.info("Performing cleanup tasks...")
        # Add any cleanup tasks here if needed
        logger.info("Application shutdown complete")
