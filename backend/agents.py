from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from dotenv import load_dotenv
import json
import logging
import traceback

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def partner_chat(learning_language, chat_history):
    logger.info("Entering partner_chat function")
    logger.info(f"Learning language: {learning_language}")
    logger.info(f"Chat history: {chat_history}")
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
            "chat_history": chat_history
        }
    )
    logger.info(f"Chain response: {response}")

    wrapped_response = AIMessage(content=response.content)
    new_chat_history = chat_history + [wrapped_response]

    logger.debug(f"Updated chat history: {chat_history}")
    logger.debug("Exiting partner_chat function")

    return response, new_chat_history

async def tutor_chat(tutoring_language, tutors_language, intervention_level, chat_history):
    try:
        logger.debug("Entering tutor_chat function")
        logger.debug(f"Tutoring language: {tutoring_language}")
        logger.debug(f"Tutor's language: {tutors_language}")
        logger.debug(f"Intervention level: {intervention_level}")
        logger.debug(f"Chat history type: {type(chat_history)}")
        logger.debug(f"Chat history length: {len(chat_history) if isinstance(chat_history, list) else 'N/A'}")
        logger.debug(f"Chat history content in tutor: {chat_history}")

        if not isinstance(chat_history, list) or len(chat_history) == 0:
            raise ValueError("Chat history must be a non-empty list")

        llm = ChatGroq(
            model="llama3-groq-70b-8192-tool-use-preview",
            temperature=0.1,
            max_tokens=None,
            timeout=None,
            max_retries=2,
        )

        # Define the JSON schema for structured output
        json_schema = {
            "title": "TutorFeedback",
            "description": "Feedback from the language tutor.",
            "type": "object",
            "properties": {
                "intervene": {
                    "type": "string",
                    "enum": ["yes", "no"],
                    "description": "Whether the tutor should intervene or not.",
                },
                "comments": {
                    "type": "string",
                    "description": f"Tutor's comments.",
                },
                "correction": {
                    "type": "string",
                    "description": f"You should have said: followed but what you guess the Human wanted to communicate not what he actually said.",
                },
            },
            "required": ["intervene", "comments", "correction"],
        }

        structured_llm = llm.with_structured_output(json_schema)

        # Get the last three messages from the chat history, or all if less than three
        last_messages = chat_history[-3:] if len(chat_history) > 3 else chat_history
        
        system_template = f"""You are a language tutor. Your task is to analyze the last few messages in a conversation, 
        focusing on the last thing the Human said. Based on the intervention level ({intervention_level}), decide whether to intervene.
        If you intervene, provide comments on the user's language use in {tutors_language}, and suggest the correct way to express 
        the idea in {tutoring_language}.

        Intervention levels and when to intervene:
        - Low: Intervene only for major errors that significantly impact communication. Examples:
            - Completely incorrect verb tenses that change the meaning
            - Using entirely wrong vocabulary that leads to misunderstandings
            - Syntax errors that make the sentence incomprehensible
        - Medium: Intervene for moderate errors that affect clarity or naturalness. Examples:
            - Minor tense mistakes that don't significantly alter the meaning
            - Vocabulary choices that are understandable but not ideal
            - Word order issues that make the sentence sound unnatural
        - High: Intervene for minor errors and provide suggestions for more natural or idiomatic expressions. Examples:
            - Small grammatical mistakes (e.g., article usage, singular/plural errors)
            - Slightly awkward phrasing that a native speaker wouldn't use
            - Opportunities to introduce more advanced or natural vocabulary

        Always intervene if what the user said makes no sense or is completely incorrect.
        
        Remember your coment should be in {tutors_language}
        And your  correction in {tutoring_language}
        
        Provide your response as a JSON object according to the specified schema.
        """

        tutor_template = ChatPromptTemplate.from_messages([
            ("system", system_template),
            MessagesPlaceholder(variable_name="chat_history")
        ])

        # Log the complete template
        logger.debug("Tutor template:")
        logger.debug(tutor_template.format(intervention_level=intervention_level, 
                                          tutors_language=tutors_language, 
                                          tutoring_language=tutoring_language, 
                                          chat_history=last_messages))

        chain = tutor_template | structured_llm

        logger.debug("Invoking the chain")
        logger.debug(f"Last messages being analyzed: {last_messages}")
        tutor_feedback = chain.invoke(
            {   
                "intervention_level": intervention_level,
                "tutors_language": tutors_language,
                "tutoring_language": tutoring_language,
                "chat_history": last_messages
            }
        )
        logger.debug(f"Structured LLM response: {tutor_feedback}")

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
