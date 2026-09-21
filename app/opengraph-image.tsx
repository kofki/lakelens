import { ImageResponse } from "next/og";
import { OG_CREAM, OG_SIZE, logoDataUri } from "@/lib/ogBrand";

/**
 * The card every link to LakeLens shows unless a page draws its own (park pages do).
 *
 * Just the mark. Messaging apps print the page title under the image, so the name is
 * already there; without this card they picked whatever image they found on the page,
 * which was a list card's photo of a Chicago bike path.
 */
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "LakeLens";

export default async function Image() {
  const logo = await logoDataUri();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: OG_CREAM,
        }}
      >
        <img src={logo} width={440} height={440} alt="" style={{ borderRadius: 96 }} />
      </div>
    ),
    size,
  );
}
