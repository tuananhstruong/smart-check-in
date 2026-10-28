import { createFileRoute } from "@tanstack/react-router";
import { ChamNhanhApp } from "@/components/ChamNhanhApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chấm Nhanh — Chấm bài bằng AI cho gia sư" },
      { name: "description", content: "Tải ảnh bài làm, AI chấm điểm, nhận xét và đề xuất bài tập, xuất báo cáo PDF." },
      { property: "og:title", content: "Chấm Nhanh — Chấm bài bằng AI cho gia sư" },
      { property: "og:description", content: "Tải ảnh bài làm, AI chấm điểm, nhận xét và đề xuất bài tập, xuất báo cáo PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChamNhanhApp,
});
