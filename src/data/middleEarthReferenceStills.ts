export const referenceStillFamilies = [
  {
    id: 'boromir-council',
    label: 'Boromir at the Council',
    description: 'For impossible tasks delivered with grave sincerity.',
    searchQuery: 'Boromir Council of Elrond reaction still Lord of the Rings',
    searchQueries: [
      'Boromir Council of Elrond still',
      'Boromir at Council of Elrond',
      'Boromir seated Council of Elrond',
      'Boromir reaction Lord of the Rings still',
    ],
  },
  {
    id: 'gandalf-bridge',
    label: 'Gandalf on the bridge',
    description: 'For boundaries, bad ideas, and firm no.',
    searchQuery: 'Gandalf Bridge of Khazad-dum reaction still Lord of the Rings',
    searchQueries: [
      'Gandalf you shall not pass bridge',
      'Gandalf Bridge of Khazad-dum still',
      'Gandalf staff raised bridge still',
    ],
  },
  {
    id: 'frodo-quest-burden',
    label: 'Frodo under quest burden',
    description: 'For daily dread and carrying too much.',
    searchQuery: 'Frodo exhausted quest burden reaction still Lord of the Rings',
    searchQueries: [
      'Frodo exhausted Mordor still',
      'Frodo carrying the Ring still',
      'Frodo on the road to Mordor still',
      'Frodo overwhelmed Lord of the Rings still',
    ],
  },
  {
    id: 'sam-carrying-frodo',
    label: 'Sam carrying Frodo',
    description: 'For showing up, support, and quiet competence.',
    searchQuery: 'Sam carrying Frodo reaction still Lord of the Rings',
    searchQueries: [
      'Sam Frodo tired Mordor',
      'Sam and Frodo Mordor still',
      'Samwise worried Frodo still',
      'Sam carrying Frodo Mount Doom',
    ],
  },
  {
    id: 'gollum-smeagol-debate',
    label: 'Gollum and Sméagol debate',
    description: 'For arguing with yourself about a bad idea.',
    searchQuery: 'Gollum Smeagol internal debate reaction still Lord of the Rings',
    searchQueries: [
      'Gollum Sméagol talking to himself still',
      'Gollum and Sméagol debate still',
      'Gollum cave reaction still',
      'Gollum Lord of the Rings still',
    ],
  },
  {
    id: 'hobbits-eating',
    label: 'Hobbits eating',
    description: 'For little treats, rest, and deserved snacks.',
    searchQuery: 'Hobbits eating feast reaction still Lord of the Rings',
    searchQueries: [
      'Hobbits eating feast still',
      'Hobbits dinner Fellowship still',
      'Hobbits food Lord of the Rings still',
      'Merry Pippin eating still',
    ],
  },
  {
    id: 'council-wide-shot',
    label: 'Council of Elrond',
    description: 'For group-chat overthinking and too many opinions.',
    searchQuery: 'Council of Elrond wide shot reaction still Lord of the Rings',
    searchQueries: [
      'Council of Elrond wide shot still',
      'Council of Elrond meeting still',
      'Council of Elrond Fellowship still',
      'Elrond council reaction still',
    ],
  },
  {
    id: 'eowyn-triumph',
    label: 'Éowyn triumph',
    description: 'For an underestimated person’s clean reversal.',
    searchQuery: 'Eowyn triumph reaction still Lord of the Rings',
    searchQueries: [
      'Eowyn Witch-king still',
      'Eowyn shieldmaiden still',
      'Eowyn battle reaction still',
      'Eowyn Lord of the Rings still',
    ],
  },
] as const;

export type ReferenceStillFamilyId = (typeof referenceStillFamilies)[number]['id'];

export function referenceStillFamilyById(id?: string) {
  return referenceStillFamilies.find((family) => family.id === id);
}

export function referenceStillSearchQuery(id?: string, fallback = ''): string {
  return referenceStillFamilyById(id)?.searchQuery || fallback.trim();
}

export function referenceStillSearchQueries(id?: string, fallback = ''): string[] {
  const family = referenceStillFamilyById(id);
  if (!family) return fallback.trim() ? [fallback.trim()] : [];
  if ('searchQueries' in family && family.searchQueries?.length) return [...family.searchQueries];
  return [family.searchQuery];
}