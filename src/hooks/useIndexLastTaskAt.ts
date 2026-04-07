import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { MeiliSearch, Task } from "meilisearch";
import { useMemo } from "react";
import { useCurrentInstance } from "./useCurrentInstance";

const PAGE_LIMIT = 1000;
const MAX_PAGES = 100;

function pickTaskActivityTimestamp(
	task: Task,
): string | Date | undefined {
	return task.finishedAt ?? task.startedAt ?? task.enqueuedAt ?? undefined;
}

export const useIndexLastTaskAt = (
	client: MeiliSearch,
	indexUids: string[],
) => {
	const currentInstance = useCurrentInstance();
	const host = currentInstance?.host;
	const enabled = indexUids.length > 0;

	const query = useQuery({
		queryKey: ["indexLastTaskAt", host, [...indexUids].sort().join(",")],
		queryFn: async () => {
			const lastByIndex = new Map<string, string | Date | undefined>();
			const target = new Set(indexUids);
			let from: number | undefined;
			let pages = 0;

			while (pages < MAX_PAGES) {
				const page = await client.getTasks({
					indexUids,
					limit: PAGE_LIMIT,
					...(from !== undefined ? { from } : {}),
				});

				for (const task of page.results) {
					const uid = task.indexUid;
					if (!uid || lastByIndex.has(uid)) {
						continue;
					}
					lastByIndex.set(uid, pickTaskActivityTimestamp(task));
				}

				const allFound = [...target].every((id) => lastByIndex.has(id));
				if (allFound) {
					break;
				}

				if (page.next == null) {
					break;
				}
				from = page.next;
				pages++;
			}

			return lastByIndex;
		},
		enabled,
		refetchInterval: 30_000,
	});

	const lastTaskAt = useMemo(() => {
		if (!query.data) {
			return {} as Record<string, string | Date | undefined>;
		}
		const result: Record<string, string | Date | undefined> = {};
		for (const [indexUid, ts] of query.data.entries()) {
			result[indexUid] = ts;
		}
		return result;
	}, [query.data]);

	return [lastTaskAt, query] as [
		Record<string, string | Date | undefined>,
		UseQueryResult<Map<string, string | Date | undefined>>,
	];
};
