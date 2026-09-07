export type AutoReviewEffect = "always_allow" | "require_approval";
export type AutoReviewScope = "command" | "prompt" | "browser";

export type AutoReviewRule = {
  id: string;
  effect: AutoReviewEffect;
  scope: AutoReviewScope;
  pattern: string;
  createdAt: string;
};
