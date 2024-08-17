from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from dotenv import load_dotenv
import json
import logging

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def partner_chat(learning_language, chat_history, transcription):
    logger.info("Entering partner_chat function")
    logger.info(f"Learning language: {learning_language}")
    logger.info(f"Chat history: {chat_history}")
    logger.info(f"Transcription: {transcription}")
    wrapped_transcription = HumanMessage(content=transcription)
    chat_history.append(wrapped_transcription)
    llm = ChatGroq(
        model="llama3-groq-70b-8192-tool-use-preview",
        temperature=0,
        max_tokens=None,
        timeout=None,
        max_retries=2,
    )

    system_template = f"""You are a chat bot that acts as a partner to a student that learns {learning_language}. 
    You talk to them and you only answer in {learning_language}, no matter what the students tells you. 
    Don't provide any further translation just answer like you are in a dialogue.
    You try to keep your answers relatively short. Try to match the level of the student
    Your response should only contain the response to the chat, nothing else!"""

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
            "chat_history": chat_history,
            "input": wrapped_transcription,
        }
    )
    logger.info(f"Chain response: {response}")

    wrapped_response = AIMessage(content=response.content)
    chat_history.append(wrapped_response)

    logger.info(f"Updated chat history: {chat_history}")
    logger.info("Exiting partner_chat function")

    return response, chat_history

async def tutor_chat(tutoring_language, tutors_language, intervention_level, chat_history):
    logger.info("Entering tutor_chat function")
    logger.info(f"Tutoring language: {tutoring_language}")
    logger.info(f"Tutor's language: {tutors_language}")
    logger.info(f"Intervention level: {intervention_level}")

    llm = ChatGroq(
        model="llama3-groq-70b-8192-tool-use-preview",
        temperature=0,
        max_tokens=None,
        timeout=None,
        max_retries=2,
    )

    # Get the last three messages from the chat history, or all if less than three
    last_messages = chat_history[-3:] if len(chat_history) > 3 else chat_history
    
    system_template = f"""You are a language tutor. Your task is to analyze the last few messages in a conversation, 
    focusing on the last thing the user said. Based on the intervention level ({intervention_level}), decide whether to intervene.
    If you intervene, provide comments on the user's language use in {tutors_language}, and suggest the correct way to express 
    the idea in {tutoring_language}.

    Intervention levels:
    - Low: Only intervene for major errors that significantly impact communication.
    - Medium: Intervene for moderate errors that affect clarity or naturalness.
    - High: Intervene for minor errors and provide suggestions for more natural or idiomatic expressions.

    Your response should be a JSON object with the following structure:
    "intervene": "yes" or "no", "comments": "Your comments in {tutors_language}", "correction": "The correct or improved expression in {tutoring_language}"
    """

    tutor_template = ChatPromptTemplate.from_messages([
        ("system", system_template),
        MessagesPlaceholder(variable_name="chat_history")
    ])

    chain = tutor_template | llm

    logger.info("Invoking the chain")
    response = chain.invoke(
        {   "intervention_level": intervention_level,
            "tutors_language": tutors_language,
            "tutoring_language": tutoring_language,
            "chat_history": last_messages
        }
    )
    logger.info(f"Chain response: {response}")

    # Parse the JSON response
    try:
        tutor_feedback = json.loads(response.content)
        logger.info(f"Parsed tutor feedback: {tutor_feedback}")
    except json.JSONDecodeError:
        logger.error("Failed to parse tutor response as JSON")
        tutor_feedback = {
            "intervene": "no",
            "comments": "Error in tutor response",
            "correction": "Error in tutor response"
        }

    logger.info("Exiting tutor_chat function")
    return tutor_feedback

async def summarize_conversation(tutoring_language, chat_history, previous_summary):
    logger.info("Entering summarize_conversation function")
    logger.info(f"Tutoring language: {tutoring_language}")
    logger.info(f"Previous summary: {previous_summary}")

    llm = ChatGroq(
        model="llama3-groq-70b-8192-tool-use-preview",
        temperature=0,
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
