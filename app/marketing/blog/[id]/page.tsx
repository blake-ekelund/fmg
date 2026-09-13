import BlogPostEditor from "@/components/marketing/blog/BlogPostEditor";

export default async function BlogPostRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BlogPostEditor id={id} />;
}
