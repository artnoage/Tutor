from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
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
    else:
        raise ValueError(f"Unsupported provider: {provider}")

async def partner_chat(learning_language, chat_history, api_key, provider="groq", last_summary=""):
    llm = get_llm(provider, "llama3-70b-8192" if provider == "groq" else  "gpt-4o-mini", api_key)

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
    try:
        if not isinstance(chat_history, list) or len(chat_history) == 0:
            raise ValueError("Chat history must be a non-empty list")

        last_human_message = next((msg for msg in reversed(chat_history) if isinstance(msg, HumanMessage)), None)
        if last_human_message is None:
            raise ValueError("No human message found in chat history")

        async def get_tutors_comment():
            llm = get_llm(provider, "llama3-70b-8192" if provider == "groq" else "gpt-4o-mini", api_key)
            comment_template = get_tutor_comment_prompt(tutoring_language, tutors_language)
            
            comment_prompt = ChatPromptTemplate.from_messages([
                ("system", comment_template),
                ("human", last_human_message.content)
            ])
            comment_chain = comment_prompt | llm
            response = await comment_chain.ainvoke({"tutors_language": tutors_language, "tutoring_language": tutoring_language})
            return response.content

        async def get_intervention_level():
            llm = get_llm(provider, "llama3-70b-8192" if provider == "groq" else "gpt-4o-mini", api_key)
            
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
            llm = get_llm(provider, "llama3-70b-8192" if provider == "groq" else "gpt-4o-mini", api_key)
                
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
    llm = get_llm(provider, "llama3-70b-8192" if provider == "groq" else "gpt-4o-mini", api_key)

    last_messages = chat_history[-5:] if len(chat_history) > 5 else chat_history
    
    system_template = get_summarizer_prompt(tutoring_language, previous_summary)

    summarizer_template = ChatPromptTemplate.from_messages([
        ("system", system_template),
        MessagesPlaceholder(variable_name="chat_history")
    ])

    chain = summarizer_template | llm

    response = await chain.ainvoke(
        {
            "chat_history": last_messages
        }
    )

    updated_summary = response.content
    return updated_summary

async def generate_homework(tutoring_language, full_context, provider="groq", api_key=None):
    try:
        llm = get_llm(provider, "llama3-70b-8192" if provider == "groq" else "gpt-4o-2024-08-06", api_key)

        # Call the grammar and vocabulary prompts in parallel
        grammar_template = get_grammar_prompt(tutoring_language, full_context)
        vocabulary_template = get_vocabulary_prompt(tutoring_language, full_context)

        grammar_prompt = ChatPromptTemplate.from_messages([
            ("system", grammar_template)
        ])
        vocabulary_prompt = ChatPromptTemplate.from_messages([
            ("system", vocabulary_template)
        ])

        grammar_chain = grammar_prompt | llm
        vocabulary_chain = vocabulary_prompt | llm

        grammar_response, vocabulary_response = await asyncio.gather(
            grammar_chain.ainvoke({}),
            vocabulary_chain.ainvoke({})
        )

        # Combine responses
        combined_response = f"{grammar_response.content}\n\n{vocabulary_response.content}"

        return combined_response

    except Exception as e:
        logger.error(f"An error occurred in generate_homework: {str(e)}")
        logger.error(traceback.format_exc())
        raise
