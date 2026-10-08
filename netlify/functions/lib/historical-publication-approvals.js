import { createHash } from "node:crypto";

// Date-specific editorial approvals from the creator's five in-chat reviews.
// Each digest binds the original bilingual copy and all nine independently
// downloaded MEDIA references. See docs/historical-edition-editorial-review.md.
// This is not permission to publish another date with the same actor or vibe.
export const HISTORICAL_PUBLICATION_APPROVALS = Object.freeze({
  "2026-09-05": "50886026ed88b8431b5577c7bcd0ffb29f52485411b847a60f5fb711414f2319",
  "2026-09-06": "39e5782cb39aee3ef4b9a48b2e927dc87b61473ddf42f3897c068dd3bfb83418",
  "2026-09-07": "e5453e74baadcb42b4a33a72a7a7c1223bb6b8ccf4be53f31eb359d4e804f742",
  "2026-09-08": "0e4c2aa206a6f25c0be17464f3548717c1faf3d93ae4ca85c1fdaf2b143ed90b",
  "2026-09-09": "101e843bc0880b3543e569c4252c294c62f697fe027e9fc38cc16941e139d02f",
  "2026-09-10": "9a15cd16278bf4733a12a895de422e60807678f1e14eb8e6e96889d9e0ebd9e1",
  "2026-09-11": "aba5526c332b017598f62019e690038803abf90a6f6351f16bd130465e25745e",
  "2026-09-12": "6d3294c1dadbc52b7219579280bc5f32e02d144cbedb381ce302966baca31840",
  "2026-09-13": "74855f2b848214f6062dd94efab956128ec3e004133213da9f8175544a831db4",
  "2026-09-14": "3c30941c631cbf2f6c50d18c22b660b46f5fd606a86f3451c59578fbf0fb23f8",
  "2026-09-15": "e2a8a7af9778b4ebf3a051ee0bd2b7e88fa23e18dc1e749ac3e70be4bd30bc6d",
  "2026-09-16": "521f01847f5b80c78baf6a86037c6761ca7c1a919711f1cdc41bd06162d45145",
  "2026-09-17": "2880e2dcbef882f9cda4513de547e0fba969b41078d675aad90256f4b4caf5a4",
  "2026-09-18": "a5d2a00512ed059ce9bfd594ef4ff75f1ff2fff01ee5d5147fef19d0f1816adf",
  "2026-09-19": "4a1ee246353ae783bdb91ff86b3fe8178749f2e3150e2a60aff4ad401bad3e1a",
  "2026-09-20": "fd282968e9643e66538dfe74d12f48597422a502e4aec4aa7a4f5a0036de3275",
  "2026-09-21": "4ad19a0c9ee0093d1aa08d76969529471bb9c6b9ebe47271145b8e6dc955f103",
  "2026-09-22": "6a1530e18d92ee633f1cce0ceacf788431de2dc6ff43bdb0d49561fdc9f8d70d",
  "2026-09-23": "7364aa9c8506ef83a5fd402882840ac9f0a37b5efe53424f1ea3da1999169299",
  "2026-09-24": "5bdd4032e6aef53143f99320bed0d3f18c674fad42ddd06d9d2bd10ef6936c65",
  "2026-09-25": "9682091c24049c1c85c0e6feaa7ba694b8ded93956590a83dc77ace28debd26d",
  "2026-09-26": "87fb4ba94c2c6ecedbe7412e6a089e6698527d475ee89678d27d340ed5a10c7e",
  "2026-09-27": "4ee3f1f7ef995ca07932fbd9c2df273827ded41674c99c1cde15863488efd663",
  "2026-09-29": "4913b3d127740221660be1da27317448eae96b5bec445138e6b9fb143fc4099a",
  "2026-09-30": "ea44d94e34ab1d638876e0cc11db1fe1ae0340581a8ea0909a0b3596d81dd08b",
  "2026-10-01": "75d7e3e6be2020f4adf4207e9ef68af226140d3f1150f8516e3ddb1182147619",
  "2026-10-02": "b3792bfd61000956aa3592830a824060a6e020e668e1b86469385a4f12314849",
  "2026-10-03": "8c35961718c470eb2cc24cee04b15f3ca928eae5450b4a5bbcee02d3f8b588b5",
  "2026-10-04": "cc7a4a0b6da1599f25a74dbed681305ad663d68839761241623625faede096a2",
  "2026-10-07": "87ec4e45efcdff6035538aaa373c54c06aa39ba4fff896250b348c788bf00423",
});

/**
 * Hash only the reviewed publication identity, copy and ordered MEDIA evidence.
 * Public-link annotations and JSON object-key ordering are not release identity.
 * Callers must still validate the complete canonical manifest with isGridManifest.
 */
export function historicalPublicationFingerprint(manifest) {
  const { actor, vibe } = manifest;
  const evidence = {
    publicationDate: manifest.publicationDate,
    actor: { id: actor.id, name: actor.name, nameEn: actor.nameEn },
    vibe: {
      key: vibe.key,
      idx: vibe.idx,
      label: vibe.label,
      labelEn: vibe.labelEn,
      subtitle: vibe.subtitle || "",
      subtitleEn: vibe.subtitleEn || "",
      supportingCopy: vibe.supportingCopy || "",
      supportingCopyEn: vibe.supportingCopyEn || "",
    },
    cards: manifest.cards.map(({ position, media }) => ({
      position,
      media: {
        schemaVersion: media.schemaVersion,
        assetId: media.assetId,
        deliveryUrl: media.deliveryUrl,
        thumbnailUrl: media.thumbnailUrl,
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes,
        checksum: media.checksum,
        dimensions: { width: media.dimensions.width, height: media.dimensions.height },
        association: {
          type: media.association.type,
          id: media.association.id,
          itemId: media.association.itemId,
        },
      },
    })),
  };
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}

export function hasHistoricalPublicationApproval(date) {
  return Object.hasOwn(HISTORICAL_PUBLICATION_APPROVALS, date);
}

export function matchesHistoricalPublicationApproval(manifest) {
  return hasHistoricalPublicationApproval(manifest.publicationDate)
    && historicalPublicationFingerprint(manifest)
      === HISTORICAL_PUBLICATION_APPROVALS[manifest.publicationDate];
}
