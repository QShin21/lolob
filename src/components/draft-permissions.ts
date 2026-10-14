import type { StateContext } from "../../shared/types";

/** Frontend affordance only; the server continues to authorize every write. */
export const canPrepareDraft = ({
  seat,
  connected,
}: Pick<StateContext, "seat" | "connected">) =>
  connected !== false &&
  !!seat &&
  (seat.role === "director" || seat.role === "data");
