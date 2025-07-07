from enum import Enum
import logging
import os
from typing import (
    Any,
    Awaitable,
    Callable,
    List,
    Optional,
    Iterator,
    AsyncIterator,
    Tuple,
    TypedDict,
)

from litellm import completion, acompletion, embedding
import litellm

from python.helpers import dotenv
from python.helpers.dotenv import load_dotenv
from python.helpers.rate_limiter import RateLimiter
from python.helpers.tokens import approximate_tokens

from langchain_core.language_models.chat_models import SimpleChatModel
from langchain_core.outputs.chat_generation import ChatGenerationChunk
from langchain_core.callbacks.manager import (
    CallbackManagerForLLMRun,
    AsyncCallbackManagerForLLMRun,
)
from langchain_core.messages import (
    BaseMessage,
    AIMessageChunk,
    HumanMessage,
    SystemMessage,
)
from langchain.embeddings.base import Embeddings
from sentence_transformers import SentenceTransformer


# disable extra logging, must be done repeatedly, otherwise browser-use will turn it back on for some reason
def turn_off_logging():
    os.environ["LITELLM_LOG"] = "ERROR"  # only errors
    litellm.suppress_debug_info = True
    # Silence **all** LiteLLM sub-loggers (utils, cost_calculator…)
    for name in logging.Logger.manager.loggerDict:
        if name.lower().startswith("litellm"):
            logging.getLogger(name).setLevel(logging.ERROR)


# init
load_dotenv()
turn_off_logging()


class ModelType(Enum):
    CHAT = "Chat"
    EMBEDDING = "Embedding"


class ModelProvider(Enum):
    ANTHROPIC = "Anthropic"
    DEEPSEEK = "DeepSeek"
    GEMINI = "Google"
    GROQ = "Groq"
    HUGGINGFACE = "HuggingFace"
    LM_STUDIO = "LM Studio"
    MISTRAL = "Mistral AI"
    OLLAMA = "Ollama"
    OPENAI = "OpenAI"
    AZURE = "OpenAI Azure"
    OPENROUTER = "OpenRouter"
    SAMBANOVA = "Sambanova"
    OTHER = "Other OpenAI compatible"


class ChatChunk(TypedDict):
    """Simplified response chunk for chat models."""

    response_delta: str
    reasoning_delta: str


rate_limiters: dict[str, RateLimiter] = {}


def get_api_key(service: str) -> str:
    return (
        dotenv.get_dotenv_value(f"API_KEY_{service.upper()}")
        or dotenv.get_dotenv_value(f"{service.upper()}_API_KEY")
        or dotenv.get_dotenv_value(f"{service.upper()}_API_TOKEN")
        or "None"
    )


def get_rate_limiter(
    provider: ModelProvider, name: str, requests: int, input: int, output: int
) -> RateLimiter:
    key = f"{provider.name}\\{name}"
    rate_limiters[key] = limiter = rate_limiters.get(key, RateLimiter(seconds=60))
    limiter.limits["requests"] = requests or 0
    limiter.limits["input"] = input or 0
    limiter.limits["output"] = output or 0
    return limiter


class LiteLLMChatWrapper(SimpleChatModel):
    model_name: str
    provider: str
    kwargs: dict = {}

    def __init__(self, model: str, provider: str, **kwargs: Any):
        model_value = f"{provider}/{model}"
        super().__init__(model_name=model_value, provider=provider, kwargs=kwargs)  # type: ignore

    @property
    def _llm_type(self) -> str:
        return "litellm-chat"

    def _convert_messages(self, messages: List[BaseMessage]) -> List[dict]:
        result = []
        # Map LangChain message types to LiteLLM roles
        role_mapping = {
            "human": "user",
            "ai": "assistant",
            "system": "system",
            "tool": "tool",
        }
        for m in messages:
            role = role_mapping.get(m.type, m.type)
            message_dict = {"role": role, "content": m.content}

            # Handle tool calls for AI messages
            tool_calls = getattr(m, "tool_calls", None)
            if tool_calls:
                # Convert LangChain tool calls to LiteLLM format
                new_tool_calls = []
                for tool_call in tool_calls:
                    # Ensure arguments is a JSON string
                    args = tool_call["args"]
                    if isinstance(args, dict):
                        import json

                        args_str = json.dumps(args)
                    else:
                        args_str = str(args)

                    new_tool_calls.append(
                        {
                            "id": tool_call.get("id", ""),
                            "type": "function",
                            "function": {
                                "name": tool_call["name"],
                                "arguments": args_str,
                            },
                        }
                    )
                message_dict["tool_calls"] = new_tool_calls

            # Handle tool call ID for ToolMessage
            tool_call_id = getattr(m, "tool_call_id", None)
            if tool_call_id:
                message_dict["tool_call_id"] = tool_call_id

            result.append(message_dict)
        return result

    def _call(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> str:
        msgs = self._convert_messages(messages)
        resp = completion(
            model=self.model_name, messages=msgs, stop=stop, **{**self.kwargs, **kwargs}
        )
        parsed = _parse_chunk(resp)
        return parsed["response_delta"]

    def _stream(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        msgs = self._convert_messages(messages)
        for chunk in completion(
            model=self.model_name,
            messages=msgs,
            stream=True,
            stop=stop,
            **{**self.kwargs, **kwargs},
        ):
            parsed = _parse_chunk(chunk)
            # Only yield chunks with non-None content
            if parsed["response_delta"]:
                yield ChatGenerationChunk(
                    message=AIMessageChunk(content=parsed["response_delta"])
                )

    async def _astream(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[AsyncCallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> AsyncIterator[ChatGenerationChunk]:
        msgs = self._convert_messages(messages)
        response = await acompletion(
            model=self.model_name,
            messages=msgs,
            stream=True,
            stop=stop,
            **{**self.kwargs, **kwargs},
        )
        async for chunk in response:  # type: ignore
            parsed = _parse_chunk(chunk)
            # Only yield chunks with non-None content
            if parsed["response_delta"]:
                yield ChatGenerationChunk(
                    message=AIMessageChunk(content=parsed["response_delta"])
                )

    async def unified_call(
        self,
        system_message="",
        user_message="",
        messages: List[BaseMessage] | None = None,
        response_callback: Callable[[str, str], Awaitable[None]] | None = None,
        reasoning_callback: Callable[[str, str], Awaitable[None]] | None = None,
        tokens_callback: Callable[[str, int], Awaitable[None]] | None = None,
        **kwargs: Any,
    ) -> Tuple[str, str]:
        if not messages:
            messages = []
        # construct messages
        if system_message:
            messages.insert(0, SystemMessage(content=system_message))
        if user_message:
            messages.append(HumanMessage(content=user_message))

        # convert to litellm format
        msgs_conv = self._convert_messages(messages)

        # call model
        _completion = await acompletion(
            model=self.model_name,
            messages=msgs_conv,
            stream=True,
            **{**self.kwargs, **kwargs},
        )

        # results
        reasoning = ""
        response = ""

        # iterate over chunks
        async for chunk in _completion:  # type: ignore
            parsed = _parse_chunk(chunk)
            # collect reasoning delta and call callbacks
            if parsed["reasoning_delta"]:
                reasoning += parsed["reasoning_delta"]
                if reasoning_callback:
                    await reasoning_callback(parsed["reasoning_delta"], reasoning)
                if tokens_callback:
                    await tokens_callback(
                        parsed["reasoning_delta"],
                        approximate_tokens(parsed["reasoning_delta"]),
                    )
            # collect response delta and call callbacks
            if parsed["response_delta"]:
                response += parsed["response_delta"]
                if response_callback:
                    await response_callback(parsed["response_delta"], response)
                if tokens_callback:
                    await tokens_callback(
                        parsed["response_delta"],
                        approximate_tokens(parsed["response_delta"]),
                    )

        # return complete results
        return response, reasoning


class BrowserCompatibleChatWrapper(LiteLLMChatWrapper):
    """
    A wrapper for browser agent that can filter/sanitize messages
    before sending them to the LLM.
    """

    def __init__(self, *args, **kwargs):
        turn_off_logging()
        super().__init__(*args, **kwargs)

    def _call(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> str:
        turn_off_logging()
        result = super()._call(messages, stop, run_manager, **kwargs)
        return result

    async def _astream(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[AsyncCallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> AsyncIterator[ChatGenerationChunk]:
        turn_off_logging()
        async for chunk in super()._astream(messages, stop, run_manager, **kwargs):
            yield chunk


class LiteLLMEmbeddingWrapper(Embeddings):
    model_name: str
    kwargs: dict = {}

    def __init__(self, model: str, provider: str, **kwargs: Any):
        self.model_name = f"{provider}/{model}" if provider != "openai" else model
        self.kwargs = kwargs

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        resp = embedding(model=self.model_name, input=texts, **self.kwargs)
        return [
            item.get("embedding") if isinstance(item, dict) else item.embedding  # type: ignore
            for item in resp.data  # type: ignore
        ]

    def embed_query(self, text: str) -> List[float]:
        resp = embedding(model=self.model_name, input=[text], **self.kwargs)
        item = resp.data[0]  # type: ignore
        return item.get("embedding") if isinstance(item, dict) else item.embedding  # type: ignore


class LocalSentenceTransformerWrapper(Embeddings):
    """Local wrapper for sentence-transformers models to avoid HuggingFace API calls"""

    def __init__(self, provider: str, model: str, **kwargs: Any):
        # Remove the "sentence-transformers/" prefix if present
        if model.startswith("sentence-transformers/"):
            model = model[len("sentence-transformers/") :]

        self.model = SentenceTransformer(model, **kwargs)
        self.model_name = model

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        embeddings = self.model.encode(texts, convert_to_tensor=False)  # type: ignore
        return embeddings.tolist() if hasattr(embeddings, "tolist") else embeddings  # type: ignore

    def embed_query(self, text: str) -> List[float]:
        embedding = self.model.encode([text], convert_to_tensor=False)  # type: ignore
        result = (
            embedding[0].tolist() if hasattr(embedding[0], "tolist") else embedding[0]
        )
        return result  # type: ignore


def _get_litellm_chat(
    cls: type = LiteLLMChatWrapper,
    model_name: str = "",
    provider_name: str = "",
    **kwargs: Any,
):
    # use api key from kwargs or env
    api_key = kwargs.pop("api_key", None) or get_api_key(provider_name)

    # Only pass API key if key is not a placeholder
    if api_key and api_key not in ("None", "NA"):
        kwargs["api_key"] = api_key

    provider_name, model_name, kwargs = _adjust_call_args(
        provider_name, model_name, kwargs
    )
    return cls(provider=provider_name, model=model_name, **kwargs)


def _get_litellm_embedding(model_name: str, provider_name: str, **kwargs: Any):
    # Check if this is a local sentence-transformers model
    if provider_name == "huggingface" and model_name.startswith(
        "sentence-transformers/"
    ):
        # Use local sentence-transformers instead of LiteLLM for local models
        provider_name, model_name, kwargs = _adjust_call_args(
            provider_name, model_name, kwargs
        )
        return LocalSentenceTransformerWrapper(
            provider=provider_name, model=model_name, **kwargs
        )

    # use api key from kwargs or env
    api_key = kwargs.pop("api_key", None) or get_api_key(provider_name)

    # Only pass API key if key is not a placeholder
    if api_key and api_key not in ("None", "NA"):
        kwargs["api_key"] = api_key

    provider_name, model_name, kwargs = _adjust_call_args(
        provider_name, model_name, kwargs
    )
    return LiteLLMEmbeddingWrapper(model=model_name, provider=provider_name, **kwargs)


def _parse_chunk(chunk: Any) -> ChatChunk:
    delta = chunk["choices"][0].get("delta", {})
    message = chunk["choices"][0].get("model_extra", {}).get("message", {})
    response_delta = (
        delta.get("content", "")
        if isinstance(delta, dict)
        else getattr(delta, "content", "")
    ) or (
        message.get("content", "")
        if isinstance(message, dict)
        else getattr(message, "content", "")
    )
    reasoning_delta = (
        delta.get("reasoning_content", "")
        if isinstance(delta, dict)
        else getattr(delta, "reasoning_content", "")
    )
    return ChatChunk(reasoning_delta=reasoning_delta, response_delta=response_delta)


def _adjust_call_args(provider_name: str, model_name: str, kwargs: dict):
    # for openrouter add app reference
    if provider_name == "openrouter":
        kwargs["extra_headers"] = {
            "HTTP-Referer": "https://agent-zero.ai",
            "X-Title": "Agent Zero",
        }

    # remap other to openai for litellm
    if provider_name == "other":
        provider_name = "openai"

    return provider_name, model_name, kwargs


def get_model(type: ModelType, provider: ModelProvider, name: str, **kwargs: Any):
    provider_name = provider.name.lower()
    if type == ModelType.CHAT:
        return _get_litellm_chat(LiteLLMChatWrapper, name, provider_name, **kwargs)
    elif type == ModelType.EMBEDDING:
        return _get_litellm_embedding(name, provider_name, **kwargs)
    else:
        raise ValueError(f"Unsupported model type: {type}")


def get_chat_model(
    provider: ModelProvider, name: str, **kwargs: Any
) -> LiteLLMChatWrapper:
    provider_name = provider.name.lower()
    model = _get_litellm_chat(LiteLLMChatWrapper, name, provider_name, **kwargs)
    return model


def get_browser_model(
    provider: ModelProvider, name: str, **kwargs: Any
) -> BrowserCompatibleChatWrapper:
    provider_name = provider.name.lower()
    model = _get_litellm_chat(
        BrowserCompatibleChatWrapper, name, provider_name, **kwargs
    )
    return model


def get_embedding_model(
    provider: ModelProvider, name: str, **kwargs: Any
) -> LiteLLMEmbeddingWrapper | LocalSentenceTransformerWrapper:
    provider_name = provider.name.lower()
    model = _get_litellm_embedding(name, provider_name, **kwargs)
    return model
