import asyncio
from python.helpers.extension import Extension
from python.helpers.memory import Memory
from agent import LoopData

DATA_NAME_TASK = "_recall_solutions_task"

class RecallSolutions(Extension):

    INTERVAL = 3
    HISTORY = 10000
    SOLUTIONS_COUNT = 2
    INSTRUMENTS_COUNT = 2
    THRESHOLD = 0.6

    async def execute(self, loop_data: LoopData = LoopData(), **kwargs):

        # every 3 iterations (or the first one) recall memories
        if loop_data.iteration % RecallSolutions.INTERVAL == 0:
            task = asyncio.create_task(self.search_solutions(loop_data=loop_data, **kwargs))
        else:
            task = None

        # set to agent to be able to wait for it
        self.agent.set_data(DATA_NAME_TASK, task)

    async def search_solutions(self, loop_data: LoopData, **kwargs):

        #cleanup
        extras = loop_data.extras_persistent
        if "solutions" in extras:
            del extras["solutions"]
        
        # try:
        # show temp info message
        self.agent.context.log.log(
            type="info", content="Searching memory for solutions...", temp=True
        )

        # show full util message, this will hide temp message immediately if turned on
        log_item = self.agent.context.log.log(
            type="util",
            heading="Searching memory for solutions...",
        )

        # get system message and chat history for util llm
        # msgs_text = self.agent.concat_messages(
        #     self.agent.history[-RecallSolutions.HISTORY :]
        # )  # only last X messages
        # msgs_text = self.agent.history.current.output_text()
        msgs_text = self.agent.history.output_text()[-RecallSolutions.HISTORY:]

        system = self.agent.read_prompt(
            "memory.solutions_query.sys.md", history=msgs_text
        )

        # log query streamed by LLM
        async def log_callback(content):
            log_item.stream(query=content)

        # call util llm to summarize conversation
        query = await self.agent.call_utility_model(
            system=system, message=loop_data.user_message.output_text() if loop_data.user_message else "", callback=log_callback
        )

        # get solutions database
        db = await Memory.get(self.agent)

        solutions = await db.search_similarity_threshold(
            query=query,
            limit=RecallSolutions.SOLUTIONS_COUNT,
            threshold=RecallSolutions.THRESHOLD,
            filter=f"area == '{Memory.Area.SOLUTIONS.value}'",
        )
        instruments = await db.search_similarity_threshold(
            query=query,
            limit=RecallSolutions.INSTRUMENTS_COUNT,
            threshold=RecallSolutions.THRESHOLD,
            filter=f"area == '{Memory.Area.INSTRUMENTS.value}'",
        )

        log_item.update(
            heading=f"{len(instruments)} instruments, {len(solutions)} solutions found",
        )

        if instruments:
            instruments_text = ""
            for instrument in instruments:
                instruments_text += instrument.page_content + "\n\n"
            instruments_text = instruments_text.strip()
            log_item.update(instruments=instruments_text)
            instruments_prompt = self.agent.read_prompt(
                "agent.system.instruments.md", instruments=instruments_text
            )
            loop_data.system.append(instruments_prompt)

        if solutions:
            solutions_text = ""
            for solution in solutions:
                solutions_text += solution.page_content + "\n\n"
            solutions_text = solutions_text.strip()
            log_item.update(solutions=solutions_text)
            solutions_prompt = self.agent.parse_prompt(
                "agent.system.solutions.md", solutions=solutions_text
            )

            # append to prompt
            extras["solutions"] = solutions_prompt

    # except Exception as e:
    #     err = errors.format_error(e)
    #     self.agent.context.log.log(
    #         type="error", heading="Recall solutions extension error:", content=err
    #     )
