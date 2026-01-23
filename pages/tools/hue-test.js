import Head from "next/head";
import { useRouter } from "next/router";
import HueTest from "../../components/HueTest";

export default function HueTestPage() {
  const router = useRouter();
  const embed = router.query.embed === "1";

  return (
    <>
      <Head>
        <title>Hue Test | Alan Ranger Academy</title>
      </Head>
      <HueTest embed={embed} />
    </>
  );
}
