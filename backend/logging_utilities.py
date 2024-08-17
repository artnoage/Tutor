# logging_utils.py

import logging
import os

logger = logging.getLogger(__name__)

def setup_logging():
    logging.basicConfig(level=logging.DEBUG)

def log_audio_data(audio_data, audio_filename):
    logger.debug(f"Received audio file: {audio_filename}")
    logger.debug(f"Mother Tongue: {audio_data.motherTongue}")
    logger.debug(f"Tutoring Language: {audio_data.tutoringLanguage}")
    logger.debug(f"Tutor's Language: {audio_data.tutorsLanguage}")
    logger.debug(f"Tutor's Voice: {audio_data.tutorsVoice}")
    logger.debug(f"Partner's Voice: {audio_data.partnersVoice}")
    logger.debug(f"Intervention Level: {audio_data.interventionLevel}")
    logger.debug(f"Chat Object: {audio_data.chatObject}")

def log_api_key_status():
    logger.debug(f"GROQ_API_KEY from env: {'set' if os.getenv('GROQ_API_KEY') else 'not set'}")
    logger.debug(f"OPENAI_API_KEY from env: {'set' if os.getenv('OPENAI_API_KEY') else 'not set'}")