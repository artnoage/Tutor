from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from dotenv import load_dotenv
import logging
import traceback
import asyncio
from prompts import *

load_dotenv()

logger = logging.getLogger(__name__)

def get_llm(provider, model_name, api_key):
    """
    Creates and returns a language model instance based on the specified provider.
    
    Args:
    provider (str): The provider of the language model (groq, openai, or anthropic).
    model_name (str): The name of the specific model to use.
    api_key (str): The API key for authentication.

    Returns:
    An instance of the specified language model.

    Raises:
    ValueError: If an unsupported provider is specified.
    """
    if provider == "groq":
        return ChatGroq(
            model=model_name,
            temperature=0,
            api_key=api_key,
            max_tokens=None,
            timeout=None,
            max_retries=2,
        )
    elif provider == "openai":
        return ChatOpenAI(
            model=model_name,
            temperature=0,
            api_key=api_key,
            max_tokens=None,
            timeout=None,
            max_retries=2,
        )
    elif provider == "anthropic":
        return ChatAnthropic(
            model=model_name,
            temperature=0,
            api_key=api_key,
            timeout=None,
            max_retries=2,
        )
    else:
        raise ValueError(f"Unsupported provider: {provider}")

async def partner_chat(learning_language, chat_history, api_key, provider="groq", last_summary=""):
    """
    Generates a response from the AI partner in the specified learning language.

    Args:
    learning_language (str): The language being learned.
    chat_history (list): The history of the conversation.
    api_key (str): The API key for authentication.
    provider (str, optional): The AI provider to use. Defaults to "groq".
    last_summary (str, optional): The last summary of the conversation. Defaults to "".

    Returns:
    tuple: A tuple containing the AI's response and the updated chat history.

    Raises:
    ValueError: If an unsupported provider is specified.
    """
    if provider == "groq":
        model = "llama3-70b-8192"
    elif provider == "openai":
        model = "gpt-4o-mini"
    elif provider == "anthropic":
        model = "claude-3-5-sonnet-20240620"
    else:
        raise ValueError(f"Unsupported provider: {provider}")
    
    llm = get_llm(provider, model, api_key)

    recent_chat_history = chat_history[-8:]

    system_template = get_partner_prompt(learning_language, last_summary)

    partner_template = ChatPromptTemplate.from_messages([
        ("system", system_template), 
        MessagesPlaceholder(variable_name="chat_history")
    ])

    chain = partner_template | llm

    response = chain.invoke(
        {
            "learning_language": learning_language,
            "chat_history": recent_chat_history
        }
    )

    wrapped_response = AIMessage(content=response.content)
    new_chat_history = chat_history + [wrapped_response]

    return response, new_chat_history

async def tutor_chat(tutoring_language, tutors_language, chat_history, tutor_history, provider="groq", api_key=None):
    """
    Generates tutor feedback based on the conversation history.

    Args:
    tutoring_language (str): The language being tutored.
    tutors_language (str): The language the tutor uses for explanations.
    chat_history (list): The history of the conversation.
    tutor_history (list): The history of tutor comments.
    provider (str, optional): The AI provider to use. Defaults to "groq".
    api_key (str, optional): The API key for authentication. Defaults to None.

    Returns:
    dict: A dictionary containing tutor feedback, including comments, corrections, and intervention level.

    Raises:
    ValueError: If chat history is empty or no human message is found.
    """
    try:
        if not isinstance(chat_history, list) or len(chat_history) == 0:
            raise ValueError("Chat history must be a non-empty list")

        last_human_message = next((msg for msg in reversed(chat_history) if isinstance(msg, HumanMessage)), None)
        if last_human_message is None:
            raise ValueError("No human message found in chat history")

        async def get_tutors_comment():
            """
            Generates the tutor's comment on the last human message.
            """
            if provider == "groq":
                model = "llama3-70b-8192"
            elif provider == "openai":
                model = "gpt-4o-mini"
            elif provider == "anthropic":
                model = "claude-3-5-sonnet-20240620"
            else:
                raise ValueError(f"Unsupported provider: {provider}")
        
            llm = get_llm(provider, model, api_key)
            comment_template = get_tutor_comment_prompt(tutoring_language, tutors_language)
            
            comment_prompt = ChatPromptTemplate.from_messages([
                ("system", comment_template),
                ("human", last_human_message.content)
            ])
            comment_chain = comment_prompt | llm
            response = await comment_chain.ainvoke({"tutors_language": tutors_language, "tutoring_language": tutoring_language})
            return response.content

        async def get_intervention_level():
            """
            Determines the level of intervention needed based on recent tutor comments.
            """
            if provider == "groq":
                model = "llama3-70b-8192"
            elif provider == "openai":
                model = "gpt-4o-mini"
            elif provider == "anthropic":
                model = "claude-3-5-sonnet-20240620"
            else:
                raise ValueError(f"Unsupported provider: {provider}")
        
            llm = get_llm(provider, model, api_key)
            
            tutor_comments = [comment for comment in tutor_history if comment.startswith("Comment:")][-4:]
            tutor_comments_str = ' '.join(tutor_comments)
            
            level_template = get_intervention_level_prompt(tutoring_language, last_human_message.content, tutor_comments_str)
            
            level_prompt = ChatPromptTemplate.from_messages([
                ("human", level_template)
            ])
            level_chain = level_prompt | llm
            response = await level_chain.ainvoke({})
            return response.content

        async def get_best_expression():
            """
            Generates the best expression or correction for the last human message.
            """
            if provider == "groq":
                model = "llama3-70b-8192"
            elif provider == "openai":
                model = "gpt-4o-mini"
            elif provider == "anthropic":
                model = "claude-3-5-sonnet-20240620"
            else:
                raise ValueError(f"Unsupported provider: {provider}")
        
            llm = get_llm(provider, model, api_key)
                
            expression_template = get_best_expression_prompt(tutoring_language)
            expression_prompt = ChatPromptTemplate.from_messages([
                ("system", expression_template),
                ("human", last_human_message.content)
            ])
            expression_chain = expression_prompt | llm
            response = await expression_chain.ainvoke({"tutoring_language": tutoring_language})
            return response.content

        tutors_comment, intervention_level, best_expression = await asyncio.gather(
            get_tutors_comment(),
            get_intervention_level(),
            get_best_expression()
        )

        tutor_feedback = {
            "comments": tutors_comment,
            "correction": best_expression,
            "intervene": intervention_level}

        return tutor_feedback

    except Exception as e:
        logger.error(f"An error occurred in tutor_chat: {str(e)}")
        logger.error(traceback.format_exc())
        raise

async def summarize_conversation(tutoring_language, chat_history, previous_summary, provider="groq", api_key=None):
    """
    Summarizes the conversation based on the chat history and previous summary.

    Args:
    tutoring_language (str): The language being tutored.
    chat_history (list): The history of the conversation.
    previous_summary (str): The previous summary of the conversation.
    provider (str, optional): The AI provider to use. Defaults to "groq".
    api_key (str, optional): The API key for authentication. Defaults to None.

    Returns:
    str: An updated summary of the conversation.

    Raises:
    ValueError: If an unsupported provider is specified.
    """
    logger.info(f"Summarizing conversation. Provider: {provider}, Tutoring language: {tutoring_language}")
    logger.info(f"Previous summary: {previous_summary}")
    logger.info(f"Chat history length: {len(chat_history)}")

    if provider == "groq":
        model = "llama3-70b-8192"
    elif provider == "openai":
        model = "gpt-4o-mini"
    elif provider == "anthropic":
        model = "claude-3-5-sonnet-20240620"
    else:
        raise ValueError(f"Unsupported provider: {provider}")

    llm = get_llm(provider, model, api_key)

    last_messages = chat_history[-5:] if len(chat_history) > 5 else chat_history
    logger.debug(f"Last messages to summarize: {last_messages}")
    
    chat_history_str = str("\n".join([f"{msg.type}: {msg.content}" for msg in last_messages]))
    system_template = get_summarizer_prompt(tutoring_language, previous_summary, chat_history_str)
    logger.debug(f"System template: {system_template}")

    summarizer_template = ChatPromptTemplate.from_messages([
        ("system", system_template),
        ("human","Please proceed:")
    ])

    chain = summarizer_template | llm


    try:
        response = await chain.ainvoke({})
        logger.info(f"Raw response from LLM: {response}")

        updated_summary = response.content
        logger.info(f"Updated summary: {updated_summary}")

        if not updated_summary.strip():
            logger.warning("Updated summary is empty or contains only whitespace")

        return updated_summary
    except Exception as e:
        logger.error(f"Error in summarize_conversation: {str(e)}")
        logger.error(traceback.format_exc())
        return ""

async def generate_homework(tutoring_language, full_context, provider="groq", api_key=None):
    """
    Generates homework based on the tutoring language and conversation context.

    Args:
    tutoring_language (str): The language being tutored.
    full_context (str): The full context of the conversation.
    provider (str, optional): The AI provider to use. Defaults to "groq".
    api_key (str, optional): The API key for authentication. Defaults to None.

    Returns:
    str: Generated homework content combining grammar and vocabulary exercises.

    Raises:
    ValueError: If an unsupported provider is specified.
    """
    try:
        if provider == "groq":
            model = "llama3-70b-8192"
        elif provider == "openai":
            model = "gpt-4o-2024-08-06"
        elif provider == "anthropic":
            model = "claude-3-5-sonnet-20240620"
        else:
            raise ValueError(f"Unsupported provider: {provider}")
        
        llm = get_llm(provider, model, api_key)

        # Call the grammar and vocabulary prompts in parallel
        grammar_template = get_grammar_prompt(tutoring_language, full_context)
        vocabulary_template = get_vocabulary_prompt(tutoring_language, full_context)

        grammar_prompt = ChatPromptTemplate.from_messages([
            ("system", grammar_template),
             ("human","Please proceed:")
        ])
        vocabulary_prompt = ChatPromptTemplate.from_messages([
            ("system", vocabulary_template),
             ("human","Please proceed:")
        ])

        grammar_chain = grammar_prompt | llm
        vocabulary_chain = vocabulary_prompt | llm

        grammar_response, vocabulary_response = await asyncio.gather(
            grammar_chain.ainvoke({}),
            vocabulary_chain.ainvoke({})
        )

        # Format and combine responses
        combined_response = f"""
# Grammar Exercises

{grammar_response.content.strip()}

---

# Vocabulary Exercises

{vocabulary_response.content.strip()}
"""

        return combined_response

    except Exception as e:
        logger.error(f"An error occurred in generate_homework: {str(e)}")
        logger.error(traceback.format_exc())
        raise

async def generate_chat_name(summary, provider="groq", api_key=None):
    """
    Generates a name for the chat based on the conversation summary.

    Args:
    summary (str): The summary of the conversation.
    provider (str, optional): The AI provider to use. Defaults to "groq".
    api_key (str, optional): The API key for authentication. Defaults to None.
    model (str, optional): The specific model to use. Defaults to None.

    Returns:
    str: A generated name for the chat.

    Raises:
    Exception: If an error occurs during the chat name generation process.
    """
    try:
        if not summary:
            return "New Chat"

        if provider == "groq":
            model = "llama3-70b-8192"
        elif provider == "openai":
            model = "gpt-4o-2024-08-06"
        elif provider == "anthropic":
            model = "claude-3-5-sonnet-20240620"
        else:
            raise ValueError(f"Unsupported provider: {provider}")
        
        llm = get_llm(provider, model, api_key)

        chat_name_template = get_chat_name_prompt(summary)

        chat_name_prompt = ChatPromptTemplate.from_messages([
            ("system", chat_name_template),
             ("human","Please proceed:")
        ])

        chat_name_chain = chat_name_prompt | llm

        response = await chat_name_chain.ainvoke({})

        return response.content.strip()

    except Exception as e:
        logger.error(f"An error occurred in generate_chat_name: {str(e)}")
        logger.error(traceback.format_exc())
        return "Empty Chat"  # Fallback name in case of any error
