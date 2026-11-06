import { KitPreview } from "./kit-preview";

export const metadata = { title: "React kit preview" };

export default function Page() {
  return (
    <>
      <h1>React kit preview</h1>
      <p>
        The real <code>@credits/react</code> components, rendered live. Pick a user state to see what each one shows. The data comes from a
        stand-in endpoint, while the buttons open the real hosted pages.
      </p>
      <KitPreview />
    </>
  );
}
