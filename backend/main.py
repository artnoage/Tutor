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
from typing import List, Dict
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
import uvicorn
import asyncio
import random
import json
import os
import re

# Load environment variables
load_dotenv()

app = FastAPI()

# Load API keys and add logging
GROQ_API_KEYS = json.loads(os.getenv("GROQ_API_KEYs", "[]"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

logger.info(f"GROQ_API_KEYs loaded: {len(GROQ_API_KEYS)} keys")
logger.info(f"OPENAI_API_KEY loaded: {'Yes' if OPENAI_API_KEY else 'No'}")

def get_random_groq_api_key():
    if not GROQ_API_KEYS:
        logger.error("No GROQ API keys available")
        raise ValueError("No GROQ API keys available")
    return random.choice(GROQ_API_KEYS)

if not OPENAI_API_KEY:
    logger.error("OPENAI_API_KEY is not set in the environment variables")
    raise ValueError("OPENAI_API_KEY is not set in the environment variables")

# Ensure .env file is loaded
logger.info(f"Current working directory: {os.getcwd()}")
logger.info(f".env file exists: {'Yes' if os.path.exists('.env') else 'No'}")

def split_text(text, max_sentences=4):
    sentences = re.split(r'(?<=[.!?])\s+', text)
    parts = []
    current_part = []
    for sentence in sentences:
        current_part.append(sentence)
        if len(current_part) == max_sentences:
            parts.append(' '.join(current_part))
            current_part = []
    if current_part:
        parts.append(' '.join(current_part))
    return parts

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
    tutoringLanguage: str
    tutorsLanguage: str
    tutorsVoice: str
    partnersVoice: str
    interventionLevel: str
    chatObject: ChatObject
    disableTutor: bool
    accentignore: bool = False  # Make it optional with False as default
    model: str

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
        
        
        # Read the audio file
        audio_content = await audio.read()
        learning_language = language_to_code(audio_data.tutoringLanguage)
        logger.info(f"Learning language code: {learning_language}")
        
        # Select the appropriate API key based on the model
        if audio_data.model == "OpenAI":
            api_key = OPENAI_API_KEY
            provider = "openai"
            logger.info("Using OpenAI API{api_key[:5]} ")
        else:
            if not groq_api_key:
                logger.info("No Groq API key provided, selecting a random one")
                api_key = get_random_groq_api_key()
            else:
                api_key = groq_api_key
            provider = "groq"
            logger.info(f"Using Groq API key: {api_key[:5]}...")  # Log first 5 characters for security
        
        # Transcribe the audio
        logger.info(f"Starting audio transcription (accentignore: {audio_data.accentignore})")
        logger.info("Starting transcribe_audio task {api_key}")
        transcription = transcribe_audio(audio_content, learning_language, api_key, new_parameter=audio_data.accentignore, provider=provider)
        logger.info(f"Transcription: {transcription}")
        
        # Convert MessageDict objects to BaseMessage objects
        logger.info("Converting chat history")
        chat_history = [dict_to_message(msg.model_dump()) for msg in audio_data.chatObject.chat_history]
        logger.info(f"Converted chat history: {chat_history}")
        wrapped_transcription = HumanMessage(content=transcription)
        chat_history.append(wrapped_transcription)
        tutor_history = audio_data.chatObject.tutors_comments

        # Use the partner_chat function to get a response
        logger.info("Starting partner_chat task")
        last_summary = audio_data.chatObject.summary[-1] if audio_data.chatObject.summary else ""
        partner_task = asyncio.create_task(partner_chat(
            audio_data.tutoringLanguage,
            chat_history,
            provider=provider,
            api_key=api_key,
            last_summary=last_summary))
        
        logger.info("Starting tutor_chat task")
        tutor_task = asyncio.create_task(tutor_chat(
            audio_data.tutoringLanguage,
            audio_data.tutorsLanguage,
            chat_history,
            tutor_history,
            provider=provider,
            api_key=api_key))
        
        (response, updated_chat_history), tutor_feedback = await asyncio.gather(partner_task, tutor_task)

        logger.info(f"Partner response: {response.content}")
        logger.info(f"Tutor feedback: {tutor_feedback}")
        
        async def generate_audio(text, voice):
            logger.info(f"Generating audio for voice: {voice}")
            return await asyncio.to_thread(generate_tts, text, OPENAI_API_KEY, voice)

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
                generate_audio(tutor_feedback["comments"], audio_data.tutorsVoice),  # TTS: Tutor's comments
                generate_audio(tutor_feedback["correction"], audio_data.tutorsVoice),  # TTS: Tutor's correction
            ])
            audio_order = ["tutor_comments", "tutor_correction"]
        else:
            logger.info(f"Tutor intervention disabled or not needed. Level: {tutor_feedback['intervene']}")
            audio_order = []

        # Split partner's response if it's long
        response_parts = split_text(response.content)
        for i, part in enumerate(response_parts):
            audio_generation_tasks.append(generate_audio(part, audio_data.partnersVoice))  # TTS: Partner's response part
            audio_order.append(f"partner_response_{i}")

        logger.info(f"Number of response parts: {len(response_parts)}")

        # Add summarizer task
        logger.info("Starting summarizer task")
        previous_summary = audio_data.chatObject.summary[-1] if audio_data.chatObject.summary else ""
        summarizer_task = summarize_conversation(
            audio_data.tutoringLanguage,
            updated_chat_history,
            previous_summary,
            provider=provider,
            api_key=api_key
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
        audio_data_list = []
        for key in audio_order:
            if key.startswith("partner_response_"):
                audio_data_list.append(audio_dict[key])
            else:
                audio_data_list.append(audio_dict[key])
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

@app.post("/generate_homework")
async def generate_homework_endpoint(request_data: AudioData):
    try:
        logger.info("Starting generate_homework function")

        # Interweave chat history and tutor comments
        interwoven_context = []
        for i, msg in enumerate(request_data.chatObject.chat_history):
            interwoven_context.append(f"{msg.type}: {msg.content}")
            
            if i < len(request_data.chatObject.tutors_comments):
                interwoven_context.append("")  # Empty line
                interwoven_context.append(f"Tutor: {request_data.chatObject.tutors_comments[i]}")
                interwoven_context.append("")  # Empty line

        # Join the interwoven context
        full_context = "\n".join(interwoven_context)

        # Select the appropriate API key based on the model
        if request_data.model.lower() == "openai":
            api_key = OPENAI_API_KEY
            provider = "openai"
            logger.info("Using OpenAI API key")
        else:
            api_key = get_random_groq_api_key()
            provider = "groq"
            logger.info(f"Using Groq API key: {api_key[:5]}...")  # Log first 5 characters for security

        # Generate homework using the new agent function
        homework = await generate_homework(
            request_data.tutoringLanguage,
            full_context,
            provider=provider,
            api_key=api_key
        )

        return JSONResponse({
            "homework": homework
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
