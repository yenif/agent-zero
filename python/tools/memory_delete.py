from python.helpers.memory import Memory
from python.helpers.tool import Tool, Response


class MemoryDelete(Tool):

    async def execute(self, ids="", **kwargs):
        db = await Memory.get(self.agent)
        ids = [id.strip() for id in ids.split(",") if id.strip()]
        dels = await db.delete_documents_by_ids(ids=ids)

        result = self.agent.read_prompt("fw.memories_deleted.md", memory_count=len(dels))
        return Response(message=result, break_loop=False)
