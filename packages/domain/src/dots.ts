export interface DotSpace {
  id: string;
  name: string;
  createdAt: string;
}
export interface DotPage {
  id: string;
  spaceId: string;
  title: string;
  content: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export type DotPageSummary = Omit<DotPage, "content">;
