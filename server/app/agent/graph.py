from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from .tools import tools
from ..config import config

# Initialize LLM
llm = ChatOpenAI(model="gpt-4o", temperature=0, openai_api_key=config.OPENAI_API_KEY)

# Prompt
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful Real Estate AI Assistant named 'Yad2Bot'. "
               "You help users find apartments and track real-estate market segments in Israel. "
               "You have access to a database of ads and can start tracking new searches. "
               "If you don't know the answer, say so."),
    ("user", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

# Agent
agent = create_openai_tools_agent(llm, tools, prompt)

# Executor
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

async def process_chat(message: str):
    result = await agent_executor.ainvoke({"input": message})
    return result["output"]
