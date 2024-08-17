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

@app.post("/process_audio")
async def process_audio(
    audio: UploadFile = File(...),
    data: str = Form(...),
    groq_api_key: str = Form(None),
    openai_api_key: str = Form(None)
):
    try:
        audio_data = AudioData.model_validate_json(data)
        
        # Log the received data
        log_audio_data(audio_data, audio.filename)
        log_api_key_status()
        
        # Read the audio file
        audio_content = await audio.read()
        learning_language = language_to_code(audio_data.tutoringLanguage)
        # Transcribe the audio using Groq API
        transcription = transcribe_audio(audio_content, learning_language, groq_api_key)
        logger.info(f"Transcription: {transcription}")
        
        # Convert MessageDict objects to BaseMessage objects
        chat_history = [dict_to_message(msg.model_dump()) for msg in audio_data.chatObject.chat_history]
        logger.info(f"Converted chat history: {chat_history}")
        
        # Use the partner_chat function to get a response
        response, updated_chat_history = await partner_chat(
            audio_data.tutoringLanguage,
            chat_history,
            transcription
        )
        logger.info(f"Partner response: {response.content}")
        
        # Create formatted conversation string
        formatted_conversation = f"You: {transcription}\n\nPartner: {response.content}"
        logger.info(f"Formatted conversation: {formatted_conversation}")
        
        # Add tutor intervention
        tutor_feedback = await tutor_chat(
            audio_data.tutoringLanguage,
            audio_data.tutorsLanguage,
            audio_data.interventionLevel,
            updated_chat_history
        )
        logger.info(f"Tutor feedback: {tutor_feedback}")
        
        # Add summarizer
        previous_summary = audio_data.chatObject.summary[-1] if audio_data.chatObject.summary else ""
        updated_summary = await summarize_conversation(
            audio_data.tutoringLanguage,
            updated_chat_history,
            previous_summary
        )
        logger.info(f"Updated summary: {updated_summary}")
        
        # Convert BaseMessage objects back to MessageDict objects
        updated_chat_object = audio_data.chatObject.model_dump()
        updated_chat_object['chat_history'] = [
            MessageDict(**message_to_dict(msg)).model_dump() for msg in updated_chat_history
        ]
        updated_chat_object['summary'].append(updated_summary)
        logger.info(f"Updated chat object: {updated_chat_object}")
        
        # Generate TTS audio using OpenAI API with the selected tutor's voice
        tts_audio = generate_tts(response.content, openai_api_key, audio_data.tutorsVoice)
        
        # Encode the TTS audio to base64
        audio_base64 = base64.b64encode(tts_audio).decode('utf-8')
        
        # Return the formatted conversation string, audio file as base64, and the updated chatObject
        return JSONResponse({
            "transcription": formatted_conversation,
            "audio_base64": audio_base64,
            "chatObject": updated_chat_object,
            "tutorFeedback": tutor_feedback,
            "updatedSummary": updated_summary
        })
    
    except Exception as e:
        logger.error(f"An error occurred: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {"message": "Welcome to the Audio Processing API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")