import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IDEA_PACKET_STAGING_AUTH_MESSAGE,
  IdeaPacketError,
  ideaPacketStagingErrorMessage,
  mediaFromResult,
  middleEarthTextFingerprint,
  packetFromMiddleEarthDraft,
} from '../src/utils/ideaPackets.ts';

test('maps a lightbox result into stable packet media provenance', () => {
  const first = mediaFromResult({
    id: 'https://images.example/original.jpg',
    title: 'Editorial still',
    thumbnail: '/.netlify/functions/image-proxy?url=original',
    url: 'https://publisher.example/story',
    publisher: 'Star · Publisher',
    batchKey: 'query-key',
    gridPosition: 4,
  });
  const second = mediaFromResult({
    id: 'https://images.example/original.jpg',
    title: 'Editorial still',
    thumbnail: '/.netlify/functions/image-proxy?url=original',
    url: 'https://publisher.example/story',
  });

  assert.equal(first.id, second.id);
  assert.equal(first.resultId, 'https://images.example/original.jpg');
  assert.equal(first.sourceUrl, 'https://publisher.example/story');
  assert.equal(first.gridPosition, 4);
});

test('builds a Middle-earth packet with structured text and persistent source provenance', () => {
  const packet = packetFromMiddleEarthDraft({
    kind: 'meme',
    title: 'Second breakfast operations',
    text: 'The deployment was small, but there was another deployment.',
    secondaryText: '— Hobbit release management',
    cardFormat: 'Reaction Card',
    cardFooter: 'Friday fellowship meeting',
    tone: 'Deadpan',
    layout: 'Editorial caption',
    character: 'Samwise',
    memeFlavor: 'Samwise Loyalty',
    comicMechanism: 'Relationship-specific contradiction',
    aesthetic: 'Cozy Hobbiton',
    artifactType: 'Meme card',
    referenceStillFamily: 'sam-carrying-frodo',
    referenceStillQuery: 'Sam carrying Frodo reaction still Lord of the Rings',
    reactionImageBrief: {
      socialUseQuery: 'friend refuses to let you suffer alone reaction',
      characterEmotionQueries: ['Samwise worried Frodo still'],
      iconicSceneQueries: ['Sam carrying Frodo Mount Doom still'],
      broadFallbackQueries: ['Lord of the Rings supportive friend reaction'],
      performedEmotion: ['concerned', 'determined'],
      visualRole: 'An overprepared friend visibly refusing to let someone suffer alone.',
    },
    creativeDirection: 'Quiet competence under pressure',
    aiGeneration: {
      provider: 'xai',
      generatedAt: '2026-08-19T13:55:00.000Z',
      model: 'grok-test',
    },
    rednoteCopy: {
      title: 'Sam carried more than the quest',
      caption: 'The quietest person in the fellowship was doing the heaviest lifting.',
      tags: ['#MiddleEarth', '#Samwise', '#Fandom'],
      character: 'Samwise',
      generatedAt: '2026-08-19T13:58:00.000Z',
      provider: 'xai',
      model: 'grok-test',
    },
    createdAt: '2026-08-19T14:00:00.000Z',
    asset: {
      id: 'result-1',
      title: 'A Shire landscape',
      thumbnail: '/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Fshire.jpg',
      url: 'https://publisher.example/shire',
      publisher: 'Example Archive',
      query: 'cozy Shire',
      provider: 'brave',
    },
  });

  const output = packet.outputs[0];
  assert.equal(packet.workspace, 'middle-earth');
  assert.equal(packet.content, 'meme');
  assert.equal(packet.provenance.sourceRoute, '/memeforge/middle-earth');
  assert.equal(output.kind, 'meme');
  assert.equal(output.sourceId, packet.sourceCards[0].id);
  assert.equal(packet.sourceCards[0].imageUrl.startsWith('/.netlify/functions/image-proxy?url='), true);
  assert.equal(packet.sourceCards[0].sourceUrl, 'https://publisher.example/shire');
  assert.equal(packet.sourceCards[0].title, 'A Shire landscape');
  assert.equal(packet.sourceCards[0].creator, 'Example Archive');
  assert.match(packet.sourceCards[0].provenance, /"rightsStatus":"unknown"/);
  assert.match(packet.sourceCards[0].provenance, /"character":"Samwise"/);
  assert.match(packet.sourceCards[0].provenance, /"memeFlavor":"Samwise Loyalty"/);
  assert.match(packet.sourceCards[0].provenance, /"comicMechanism":"Relationship-specific contradiction"/);
  assert.match(packet.sourceCards[0].provenance, /"referenceStillFamily":"sam-carrying-frodo"/);
  assert.match(packet.sourceCards[0].provenance, /"referenceStillQuery":"Sam carrying Frodo reaction still Lord of the Rings"/);
  assert.match(packet.sourceCards[0].provenance, /"socialUseQuery":"friend refuses to let you suffer alone reaction"/);
  assert.match(packet.sourceCards[0].provenance, /"query":"cozy Shire"/);
  assert.equal(packet.middleEarthContent?.[output.id].text, 'The deployment was small, but there was another deployment.');
  assert.equal(packet.middleEarthContent?.[output.id].memeFlavor, 'Samwise Loyalty');
  assert.equal(packet.middleEarthContent?.[output.id].comicMechanism, 'Relationship-specific contradiction');
  assert.equal(packet.middleEarthContent?.[output.id].aesthetic, 'Cozy Hobbiton');
  assert.equal(packet.middleEarthContent?.[output.id].artifactType, 'Meme card');
  assert.equal(packet.middleEarthContent?.[output.id].cardFormat, 'Reaction Card');
  assert.equal(packet.middleEarthContent?.[output.id].cardFooter, 'Friday fellowship meeting');
  assert.equal(packet.middleEarthContent?.[output.id].referenceStillFamily, 'sam-carrying-frodo');
  assert.equal(packet.middleEarthContent?.[output.id].referenceStillQuery, 'Sam carrying Frodo reaction still Lord of the Rings');
  assert.equal(packet.middleEarthContent?.[output.id].reactionImageBrief?.visualRole, 'An overprepared friend visibly refusing to let someone suffer alone.');
  assert.equal(packet.middleEarthContent?.[output.id].rednoteCopy?.tags[1], '#Samwise');
  assert.equal(packet.actor.name, 'Samwise');
  assert.equal(packet.workingAngle, 'Quiet competence under pressure');
  assert.equal(packet.captionSeeds, 'The quietest person in the fellowship was doing the heaviest lifting.');
  assert.equal(packet.outputAngles, '#MiddleEarth\n#Samwise\n#Fandom');
  assert.ok(output.textFingerprint);
  const content = packet.middleEarthContent?.[output.id];
  assert.ok(content);
  assert.notEqual(
    middleEarthTextFingerprint({ ...content, memeFlavor: 'Council of Elrond' }),
    output.textFingerprint,
  );
  assert.notEqual(
    middleEarthTextFingerprint({ ...content, comicMechanism: 'Severity inversion' }),
    output.textFingerprint,
  );
  assert.notEqual(
    middleEarthTextFingerprint({ ...content, aesthetic: 'Illuminated manuscript' }),
    output.textFingerprint,
  );
  assert.notEqual(
    middleEarthTextFingerprint({ ...content, artifactType: 'Hero card' }),
    output.textFingerprint,
  );
  assert.notEqual(
    middleEarthTextFingerprint({ ...content, cardFormat: 'Dialogue Card' }),
    output.textFingerprint,
  );
  assert.notEqual(
    middleEarthTextFingerprint({ ...content, cardFooter: 'A new tiny footer' }),
    output.textFingerprint,
  );
  assert.notEqual(
    middleEarthTextFingerprint({
      ...content,
      reactionImageBrief: {
        ...content.reactionImageBrief!,
        visualRole: 'A decorative Shire landscape.',
      },
    }),
    output.textFingerprint,
  );
});

test('builds typography-only spellbook packets without inventing an external image', () => {
  const packet = packetFromMiddleEarthDraft({
    kind: 'spellbook',
    title: 'Road notes',
    text: 'Not all those who wander are lost.',
    tone: 'Field note',
    layout: 'Type specimen',
    createdAt: '2026-08-19T14:00:00.000Z',
  });

  assert.deepEqual(packet.anchor.imageUrls, []);
  assert.equal(packet.sourceCards[0].imageUrl, '');
  assert.equal(packet.sourceCards[0].sourceUrl, 'https://fandom.justlikekatie.com/memeforge/middle-earth');
  assert.equal(packet.outputs[0].kind, 'spellbook');
});

test('carries a non-destructive MemeForge rework recipe and source identity through CREATE', () => {
  const memeRework = {
    schemaVersion: 1 as const,
    kind: 'meme-rework' as const,
    createdAt: '2026-08-28T12:00:00.000Z',
    original: {
      resultId: 'gandalf-original',
      title: 'Gandalf original meme',
      sourceUrl: 'https://publisher.example/gandalf',
      publisher: 'Example publisher',
      searchQuery: 'Gandalf Friday meme',
      provider: 'brave',
      sourceType: 'archive' as const,
    },
    edit: {
      type: 'text-overlay' as const,
      mode: 'cover-and-replace' as const,
      line1: 'You shall not deploy',
      line2: 'Without a rollback plan',
      footer: 'Friday fellowship',
      layout: 'Classic top / bottom',
      tone: 'Dry',
    },
  };
  const packet = packetFromMiddleEarthDraft({
    kind: 'meme',
    title: 'Friday fellowship',
    text: 'You shall not deploy',
    secondaryText: 'Without a rollback plan',
    tone: 'Dry',
    layout: 'Classic top / bottom',
    character: 'Gandalf',
    creationPath: 'meme-rework',
    memeRework,
    asset: {
      id: 'gandalf-original',
      title: 'Gandalf original meme',
      thumbnail: 'https://images.example/gandalf.jpg',
      url: 'https://publisher.example/gandalf',
      publisher: 'Example publisher',
      query: 'Gandalf Friday meme',
      provider: 'brave',
    },
    createdAt: '2026-08-28T12:00:00.000Z',
  });
  const output = packet.outputs[0];
  const content = packet.middleEarthContent?.[output.id];

  assert.equal(content?.creationPath, 'meme-rework');
  assert.deepEqual(content?.memeRework, memeRework);
  assert.match(packet.sourceCards[0].provenance, /"creationPath":"meme-rework"/);
  assert.match(packet.sourceCards[0].provenance, /"derivativeOf"/);
  assert.match(packet.notes, /Non-destructive MemeForge rework/);
  assert.notEqual(
    middleEarthTextFingerprint({ ...content!, memeRework: { ...memeRework, edit: { ...memeRework.edit, mode: 'add-overlay' } } }),
    output.textFingerprint,
  );
});

test('keeps packet staging authorization failures separate from successful MemeForge generation', () => {
  assert.equal(
    ideaPacketStagingErrorMessage(new IdeaPacketError('Fandom Admin authorization is required.', 401)),
    IDEA_PACKET_STAGING_AUTH_MESSAGE,
  );
  assert.match(IDEA_PACKET_STAGING_AUTH_MESSAGE, /MemeForge object is still ready/);
  assert.match(IDEA_PACKET_STAGING_AUTH_MESSAGE, /Sign in again through packet staging/);
});
