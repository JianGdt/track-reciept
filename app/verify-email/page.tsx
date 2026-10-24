import { Auth } from "@/components/auth";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <Auth
      initialMessage={
        params.error
          ? "This verification link is invalid or has expired. Enter your email and request a new link below."
          : "You can now log in after verifying your email."
      }
    />
  );
}
