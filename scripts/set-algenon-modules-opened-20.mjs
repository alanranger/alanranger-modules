/**
 * One-off: set algenon@hotmail.com to 20/60 foundation modules opened (test data).
 * Updates Memberstack JSON (live widget source) + ms_members_cache mirror.
 */
import { createClient } from "@supabase/supabase-js";
import memberstackAdmin from "@memberstack/admin";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local") });

const MEMBER_ID = "mem_cmjyljfkm0hxg0sntegon6ghi";
const TARGET_COUNT = 20;

const MODULE_PATHS = [
  "/blog-on-photography/what-is-exposure-in-photography",
  "/blog-on-photography/what-is-aperture-in-photography",
  "/blog-on-photography/what-is-shutter-speed",
  "/blog-on-photography/what-is-iso-in-photography",
  "/blog-on-photography/what-is-manual-exposure-in-photography",
  "/blog-on-photography/what-is-metering-in-photography",
  "/blog-on-photography/exposure-bracketing-a-guide-for-photographers",
  "/blog-on-photography/what-is-focus-in-photography",
  "/blog-on-photography/what-is-depth-of-field",
  "/blog-on-photography/what-is-dynamic-range-in-photography",
  "/blog-on-photography/what-is-white-balance-in-photography",
  "/blog-on-photography/what-are-camera-drive-modes",
  "/blog-on-photography/jpeg-vs-raw-the-key-differences",
  "/blog-on-photography/full-frame-vs-cropped-sensor",
  "/blog-on-photography/what-is-focal-length-in-photography",
  "/blog-on-photography/tripod-for-cameras-essential-guide",
  "/blog-on-photography/are-camera-uv-filters-worth-it",
  "/blog-on-photography/10-basic-camera-settings-for-camera",
  "/blog-on-photography/camera-sensor-cleaning-guide",
  "/blog-on-photography/best-camera-bags-for-different-trips",
];

const CATS = [
  "camera", "camera", "camera", "camera", "camera", "camera", "camera", "camera",
  "camera", "camera", "camera", "camera", "camera", "camera", "camera",
  "gear", "gear", "gear", "gear", "gear",
];

const TITLES = [
  "01 What Is Exposure In Photography",
  "02 What Is Aperture In Photography",
  "03 What Is Shutter Speed",
  "04 What Is Iso In Photography",
  "05 What Is Manual Exposure In Photography",
  "06 What Is Metering In Photography",
  "07 Exposure Bracketing A Guide For Photographers",
  "08 What Is Focus In Photography",
  "09 What Is Depth Of Field",
  "10 What Is Dynamic Range In Photography",
  "11 What Is White Balance In Photography",
  "12 What Are Camera Drive Modes",
  "13 Jpeg Vs Raw The Key Differences",
  "14 Full Frame Vs Cropped Sensor",
  "15 What Is Focal Length In Photography",
  "16 Tripod For Cameras Essential Guide",
  "17 Are Camera Uv Filters Worth It",
  "18 10 Basic Camera Settings For Camera",
  "19 Camera Sensor Cleaning Guide",
  "20 Best Camera Bags For Different Trips",
];

function buildOpenedSlice(existingOpened) {
  const now = new Date().toISOString();
  const opened = {};
  for (let i = 0; i < TARGET_COUNT; i++) {
    const path = MODULE_PATHS[i];
    const prev = existingOpened?.[path];
    opened[path] = {
      t: prev?.t || TITLES[i],
      at: prev?.at || now,
      cat: prev?.cat || CATS[i],
      lastAt: prev?.lastAt || prev?.at || now,
    };
  }
  return opened;
}

async function main() {
  const msKey = process.env.MEMBERSTACK_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!msKey || !supabaseUrl || !supabaseKey) {
    throw new Error("Missing MEMBERSTACK_SECRET_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const memberstack = memberstackAdmin.init(msKey);
  const supabase = createClient(supabaseUrl, supabaseKey);

  const retrieveRes = await memberstack.members.retrieve({ id: MEMBER_ID });
  const member = retrieveRes?.data || retrieveRes;
  const currentJson = member?.json && typeof member.json === "object" ? member.json : {};
  const arAcademy = currentJson.arAcademy && typeof currentJson.arAcademy === "object"
    ? { ...currentJson.arAcademy }
    : {};
  const modules = arAcademy.modules && typeof arAcademy.modules === "object"
    ? { ...arAcademy.modules }
    : {};
  const existingOpened = modules.opened && typeof modules.opened === "object" ? modules.opened : {};

  const beforeCount = Object.keys(existingOpened).length;
  modules.opened = buildOpenedSlice(existingOpened);
  arAcademy.modules = modules;
  const nextJson = { ...currentJson, arAcademy };

  await memberstack.members.update({
    id: MEMBER_ID,
    data: { json: nextJson },
  });

  let cacheUpdated = false;
  try {
    const { data: cacheRow, error: cacheReadErr } = await supabase
      .from("ms_members_cache")
      .select("raw")
      .eq("member_id", MEMBER_ID)
      .maybeSingle();
    if (cacheReadErr) throw cacheReadErr;

    const raw = cacheRow?.raw && typeof cacheRow.raw === "object" ? { ...cacheRow.raw } : {};
    raw.json = nextJson;

    const { error: cacheUpdateErr } = await supabase
      .from("ms_members_cache")
      .update({ raw, updated_at: new Date().toISOString() })
      .eq("member_id", MEMBER_ID);
    if (cacheUpdateErr) throw cacheUpdateErr;
    cacheUpdated = true;
  } catch (cacheErr) {
    console.warn("[cache] Supabase client update skipped:", cacheErr?.message || cacheErr);
  }

  const verifyRes = await memberstack.members.retrieve({ id: MEMBER_ID });
  const verifyMember = verifyRes?.data || verifyRes;
  const verifyOpened = verifyMember?.json?.arAcademy?.modules?.opened || {};
  const afterCount = Object.keys(verifyOpened).length;

  console.log(JSON.stringify({
    member_id: MEMBER_ID,
    email: "algenon@hotmail.com",
    modules_opened_before: beforeCount,
    modules_opened_after: afterCount,
    foundation_display: `${afterCount}/60`,
    memberstack_updated: true,
    ms_members_cache_updated: cacheUpdated,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
