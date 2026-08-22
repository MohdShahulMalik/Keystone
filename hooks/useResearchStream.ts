import { useCallback, useEffect, useState } from "react";

export interface ResearchSession {
  status: "idle" | "connecting" | "running" | "completed" | "error";
  mainText: string;
  error?: string;
  messageId?: string;
}

export function useResearchStream(sessionId: string | null) {
  const [state, setState] = useState<ResearchSession>({
    status: "idle",
    mainText: "",
  });

  useEffect(() => {
    if (!sessionId) return;

    const eventSource = new EventSource(
      `/api/research/stream?sessionId=${sessionId}`,
    );

    eventSource.addEventListener("chunk", (e) => {
      const { text } = JSON.parse(e.data);
      setState((prev) => ({
        ...prev,
        status: "running",
        mainText: prev.mainText + text,
      }));
    });

    eventSource.addEventListener("status", (e) => {
      const { status } = JSON.parse(e.data);
      setState((prev) => ({
        ...prev,
        status,
      }));
    });

    eventSource.addEventListener("message.complete", (e) => {
      const { messageId } = JSON.parse(e.data);
      setState((prev) => ({
        ...prev,
        status: "completed",
        messageId,
      }));
    });

    eventSource.addEventListener("error", (e: MessageEvent) => {
      const data = e.data
        ? JSON.parse(e.data)
        : { message: "Connection error" };
      setState((prev) => ({
        ...prev,
        status: "error",
        error: data.message,
      }));
      eventSource.close();
    });

    eventSource.addEventListener("done", () => {
      setState((prev) => ({
        ...prev,
        status: "completed",
      }));
      eventSource.close();
    });

    eventSource.onerror = () => {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: "Connection error",
      }));
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId]);

  const reset = useCallback(() => {
    setState({
      status: "idle",
      mainText: "",
    });
  }, []);

  return { ...state, reset };
}
