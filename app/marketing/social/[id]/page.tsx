import SocialPostBuilder from "@/components/marketing/social/SocialPostBuilder";

/** One social post in the builder. Reached from /marketing/social. */
export default async function SocialPostRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SocialPostBuilder id={id} />;
}
