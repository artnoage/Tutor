from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from dotenv import load_dotenv
from typing import Optional
import logging
import traceback
import os
import random 
import json
import asyncio
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ChatOpenRouter(ChatOpenAI):
    openai_api_base: str
    openai_api_key: str
    model_name: str

    def __init__(self,
                 model_name: str,
                 openai_api_key: Optional[str] = None,
                 openai_api_base: str = "https://openrouter.ai/api/v1",
                 **kwargs):
        openai_api_key = openai_api_key or os.getenv('OPENROUTER_API_KEY')
        super().__init__(openai_api_base=openai_api_base,
                         openai_api_key=openai_api_key,
                         model_name=model_name, **kwargs)



async def partner_chat(learning_language, chat_history,disable_tutor):
    logger.info("Entering partner_chat function")
    logger.info(f"Learning language: {learning_language}")
    logger.info(f"Chat history: {chat_history}")



    if disable_tutor==True:
        llm = ChatOpenRouter(model_name="nousresearch/hermes-3-llama-3.1-405b")
    else:
    # Randomly choose one of the API keys
      
        llm = ChatGroq(
                model="llama-3.1-70b-versatile",
                temperature=0,
                api_key=os.getenv('GROQ_API_KEY4'),
                max_tokens=None,
                timeout=None,
                max_retries=2,
            )

    system_template = f"""You are a chat bot that acts as a partner to a student learning {learning_language}. 
    You must always respond in {learning_language}, regardless of the language the student uses. 
    If the student doesn't use {learning_language}, gently encourage them to do so in your response, however if the mix
    one or two english words, please ignore it (it is part of the learning process).
    Keep your answers relatively short and try to match the student's language level.
    Always respond as if in a natural dialogue. Your response should only contain your reply to the chat, nothing else!"""

    logger.info(f"System template: {system_template}")

    partner_template = ChatPromptTemplate.from_messages([
        ("system", system_template), 
        MessagesPlaceholder(variable_name="chat_history")
    ])

    chain = partner_template | llm

    logger.info("Invoking the chain")
    response = chain.invoke(
        {
            "learning_language": learning_language,
            "chat_history": chat_history
        }
    )
    logger.info(f"Chain response: {response}")

    wrapped_response = AIMessage(content=response.content)
    new_chat_history = chat_history + [wrapped_response]

    logger.debug(f"Updated chat history: {chat_history}")
    logger.debug("Exiting partner_chat function")

    return response, new_chat_history

async def tutor_chat(tutoring_language, tutors_language, chat_history):
    try:
        logger.debug("Entering tutor_chat function")
        logger.debug(f"Tutoring language: {tutoring_language}")
        logger.debug(f"Tutor's language: {tutors_language}")
        logger.debug(f"Chat history type: {type(chat_history)}")
        logger.debug(f"Chat history length: {len(chat_history) if isinstance(chat_history, list) else 'N/A'}")
        logger.debug(f"Chat history content in tutor: {chat_history}")

        if not isinstance(chat_history, list) or len(chat_history) == 0:
            raise ValueError("Chat history must be a non-empty list")

        last_messages = chat_history[-3:] if len(chat_history) > 3 else chat_history
        openai_api_key = os.getenv('OPENAI_API_KEY')

        

        async def get_tutors_comment():
            llm = ChatGroq(
                model="llama-3.1-70b-versatile",
                temperature=0,
                api_key=os.getenv('GROQ_API_KEY2'),
                max_tokens=None,
                timeout=None,
                max_retries=2,
            )
            comment_template = """As a {tutoring_language} verbal communication commentator:

                                    Review the transcribed Human's last utterance.
                                    Comment briefly on their spoken {tutoring_language}, focusing on things like grammar, vocabulary and sentence structure!
                                    Comment only if there is something to useful to add. You can additionally provide very short tutoring advice if relevant.

                                    If not speaking {tutoring_language}, note this as the main issue.
                                    Comment only on language use, not content.
                                    Respond in {tutors_language}.

                                    Notes:

                                    Ignore spelling in transcription.
                                    Don't focus on formality unless very inappropriate for context.
                                    Keep observations concise and constructive."""
            
            comment_prompt = ChatPromptTemplate.from_messages([
                ("system", comment_template),
                MessagesPlaceholder(variable_name="chat_history")
            ])
            comment_chain = comment_prompt | llm
            response = await comment_chain.ainvoke({"chat_history": last_messages, "tutors_language": tutors_language, "tutoring_language": tutoring_language})
            return response.content

        async def get_intervention_level():
            api_key1 = os.getenv('GROQ_API_KEY')
            api_key2 = os.getenv('GROQ_API_KEY2')
            api_key3= os.getenv('GROQ_API_KEY3')
            openai_api_key = os.getenv('OPENAI_API_KEY')
            llm = ChatOpenAI(model="gpt-4o-mini",temperature=0,max_tokens=None,timeout=None,max_retries=2)    
            level_template = """# {tutoring_language} Tutor Assessment Guidelines

                                You are a {tutoring_language} chat tutor. Your task is to assess the need for intervention based on a transcribed verbal communication in {tutoring_language}, focusing on the Human's last utterance. 

                                ## Assessment Levels

                                Evaluate the language use and choose ONE of the following intervention levels:

                                1. "no"
                                2. "low"
                                3. "medium"
                                4. "high"

                                ## Assessment Criteria

                                Use these guidelines to determine the appropriate level:

                                ### "no"
                                - Near-native or very advanced use of {tutoring_language}
                                - No noticeable errors or only very minor ones
                                - Rich vocabulary and complex structures used appropriately
                                - Clear and effective communication

                                ### "low"
                                - Generally good command of {tutoring_language}
                                - A few minor grammatical or vocabulary errors that don't impede understanding
                                - Mostly appropriate use of idioms and colloquialisms
                                - Occasional hesitations or simple structures, but overall fluent

                                ### "medium"
                                - Noticeable grammatical errors or inappropriate word choices
                                - Limited vocabulary range, relying on basic or repetitive structures
                                - Some awkward phrasing or literal translations from another language
                                - Communication is understandable but requires some effort from the listener
                                - Frequent pauses or filler words indicating language processing difficulties

                                ### "high"
                                - Significant and frequent grammatical errors
                                - Very limited vocabulary, unable to express complex ideas
                                - Heavy reliance on simple or incorrect sentence structures
                                - Communication is difficult and often unclear
                                - Extensive use of another language or not using {tutoring_language} at all
                                - User speaks in a different language than {tutoring_language}
                                - Any other unusual language behavior

                                ## Additional Notes
                                - Ignore spelling in transcription
                                - Don't consider formality unless grossly inappropriate for the context
                                - Focus on language use patterns rather than isolated mistakes
                                - Consider fluency and overall communicative effectiveness

                                ## Response Format
                                Your response must be ONLY ONE of these words: "no", "low", "medium", or "high".

                                Do not provide any explanation or additional commentary. Simply output the chosen intervention level.

                                ## Transcription """
            
            level_prompt = ChatPromptTemplate.from_messages([
                ("system", level_template),
                MessagesPlaceholder(variable_name="chat_history")
            ])
            level_chain = level_prompt | llm
            response = await level_chain.ainvoke({"chat_history": last_messages, "tutoring_language": tutoring_language})
            return response.content

        async def get_best_expression():

            
            llm = ChatGroq(
                model="llama-3.1-70b-versatile",
                temperature=0,
                api_key=os.getenv('GROQ_API_KEY3'),
                max_tokens=None,
                timeout=None,
                max_retries=2)
                
            expression_template = """Instructions for rephrasing in {tutoring_language}:

                                Review the transcribed Human's last utterance.
                                If not in {tutoring_language}, translate to {tutoring_language}.
                                Rephrase the utterance to reflect correct, natural {tutoring_language} use:

                                Fix grammatical errors
                                Use appropriate vocabulary and idioms
                                Maintain the original meaning and intent
                                Keep the style suitable for verbal communication


                                Ignore transcription spelling errors
                                Maintain the level of formality from the original utterance
                                Return only the corrected expression in {tutoring_language}
                                Do not add any explanations or additional output"""
            expression_prompt = ChatPromptTemplate.from_messages([
                ("system", expression_template),
                MessagesPlaceholder(variable_name="chat_history")
            ])
            expression_chain = expression_prompt | llm
            response = await expression_chain.ainvoke({"chat_history": last_messages, "tutoring_language": tutoring_language})
            return response.content

        logger.debug("Invoking concurrent LLM calls")
        tutors_comment, intervention_level, best_expression = await asyncio.gather(
            get_tutors_comment(),
            get_intervention_level(),
            get_best_expression()
        )

        tutor_feedback = {
            "comments": tutors_comment,
            "correction": best_expression,
            "intervene": intervention_level}

        logger.debug(f"Tutor feedback:{json.dumps(tutor_feedback)}")
        logger.debug("Exiting tutor_chat function")
        return tutor_feedback

    except Exception as e:
        logger.error(f"An error occurred in tutor_chat: {str(e)}")
        logger.error(traceback.format_exc())
        raise


async def summarize_conversation(tutoring_language, chat_history, previous_summary):
    logger.info("Entering summarize_conversation function")
    logger.info(f"Tutoring language: {tutoring_language}")
    logger.info(f"Previous summary: {previous_summary}")

    llm = ChatGroq(
            model="llama-3.1-70b-versatile",
            temperature=0,
            api_key=os.getenv('GROQ_API_KEY2'),
            max_tokens=None,
            timeout=None,
            max_retries=2,
        )
 


    # Get the last few messages from the chat history, or all if less than five
    last_messages = chat_history[-5:] if len(chat_history) > 5 else chat_history
    
    system_template = f"""You are a conversation summarizer. Your task is to update the summary of a conversation 
    based on the most recent messages and the previous summary. The summary should be concise yet informative, 
    capturing the main points and any significant developments in the conversation.

    Please follow these guidelines:
    1. The summary should be in {tutoring_language}.
    2. Focus on the key points discussed in the recent messages.
    3. Incorporate relevant information from the previous summary.
    4. Keep the summary concise, ideally no more than 3-4 sentences.
    5. Highlight any new topics or significant shifts in the conversation.

    Previous summary: {previous_summary}

    Your response should be the updated summary in {tutoring_language}.
    """

    summarizer_template = ChatPromptTemplate.from_messages([
        ("system", system_template),
        MessagesPlaceholder(variable_name="chat_history")
    ])

    chain = summarizer_template | llm

    logger.info("Invoking the chain")
    response = chain.invoke(
        {
            "chat_history": last_messages
        }
    )
    logger.info(f"Chain response: {response}")

    updated_summary = response.content
    logger.info(f"Updated summary: {updated_summary}")

    logger.info("Exiting summarize_conversation function")
    return updated_summary
