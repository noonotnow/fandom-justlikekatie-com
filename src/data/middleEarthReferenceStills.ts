export const referenceStillFamilies = [
  {
    id: 'boromir-council',
    label: 'Boromir at the Council',
    description: 'For impossible tasks delivered with grave sincerity.',
    searchQuery: 'Boromir Council of Elrond reaction still Lord of the Rings',
  },
  {
    id: 'gandalf-bridge',
    label: 'Gandalf on the bridge',
    description: 'For boundaries, bad ideas, and firm no.',
    searchQuery: 'Gandalf Bridge of Khazad-dum reaction still Lord of the Rings',
  },
  {
    id: 'frodo-quest-burden',
    label: 'Frodo under quest burden',
    description: 'For daily dread and carrying too much.',
    searchQuery: 'Frodo exhausted quest burden reaction still Lord of the Rings',
  },
  {
    id: 'sam-carrying-frodo',
    label: 'Sam carrying Frodo',
    description: 'For showing up, support, and quiet competence.',
    searchQuery: 'Sam carrying Frodo reaction still Lord of the Rings',
  },
  {
    id: 'gollum-smeagol-debate',
    label: 'Gollum and Sméagol debate',
    description: 'For arguing with yourself about a bad idea.',
    searchQuery: 'Gollum Smeagol internal debate reaction still Lord of the Rings',
  },
  {
    id: 'hobbits-eating',
    label: 'Hobbits eating',
    description: 'For little treats, rest, and deserved snacks.',
    searchQuery: 'Hobbits eating feast reaction still Lord of the Rings',
  },
  {
    id: 'council-wide-shot',
    label: 'Council of Elrond',
    description: 'For group-chat overthinking and too many opinions.',
    searchQuery: 'Council of Elrond wide shot reaction still Lord of the Rings',
  },
  {
    id: 'eowyn-triumph',
    label: 'Éowyn triumph',
    description: 'For an underestimated person’s clean reversal.',
    searchQuery: 'Eowyn triumph reaction still Lord of the Rings',
  },
] as const;

export type ReferenceStillFamilyId = (typeof referenceStillFamilies)[number]['id'];

export function referenceStillFamilyById(id?: string) {
  return referenceStillFamilies.find((family) => family.id === id);
}

export function referenceStillSearchQuery(id?: string, fallback = ''): string {
  return referenceStillFamilyById(id)?.searchQuery || fallback.trim();
}