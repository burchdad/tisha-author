export const defaultSettings = {
  _id: 'siteSettings', _type: 'siteSettings',
  shippingMessage: 'Books will ship the week of November 20th.',
  paperbackPrice: 13.99,
  hardcoverPrice: 16.99,
};

export const defaultCurricula = [
  {
    _id: 'curriculum-companion', _type: 'curriculum', title: "Rider's Magic Mark Curriculum Companion",
    description: '15 pages · Pre-K–Grade 3 · Teacher & student activities',
    existingUrl: '/resources/riders-magic-mark-curriculum-companion.pdf', placement: 'companion', order: 1,
  },
  {
    _id: 'curriculum-gratitude', _type: 'curriculum', title: 'Growing Gratitude and Confidence',
    description: '69 pages · A caring classroom philosophy for building confidence, kindness, and community',
    existingUrl: '/resources/growing-gratitude-and-confidence-curriculum.pdf', placement: 'gratitude', order: 2,
  },
];

export const defaultMedia = [
  { _id: 'media-apple', _type: 'mediaLink', category: 'podcast', title: 'unEDited Chatter on Apple Podcasts', url: 'https://podcasts.apple.com/au/podcast/unedited-chatter/id1846488817', order: 1 },
  { _id: 'media-youtube', _type: 'mediaLink', category: 'podcast', title: 'unEDited Chatter on YouTube', url: 'https://www.youtube.com/@unEDitedchatter', order: 2 },
  { _id: 'media-gratitude', _type: 'mediaLink', category: 'blog', title: 'Practicing Gratitude', url: 'https://www.educationworld.com/blog/practicing-gratitude-personally-and-professional-classroom-community', order: 3 },
  { _id: 'media-confidence', _type: 'mediaLink', category: 'blog', title: 'Growing Gratitude and Confidence', url: 'https://www.educationworld.com/blog/growing-gratitude-and-confidence-our-classroom-communities', order: 4 },
];

export const photoSlots = [
  { name: 'author', title: 'Author portrait', selector: '.author-photo img', url: '/story/tisha-shipley-author.jpg', alt: "Dr. Tisha Shipley with Rider's Magic Mark book and Rider puppet" },
  { name: 'illustrator', title: 'Illustrator portrait', selector: '.illustrator-photo img', url: '/story/chandrani-das.jpg', alt: 'Illustrator Chandrani Das standing outdoors' },
  { name: 'visit', title: 'School visit photo', selector: '.visit-photo img', url: '/story/tisha-laying-down.jpg', alt: "Dr. Tisha Shipley with the Rider puppet and Rider's Magic Mark book" },
];

export const defaultPhotos = photoSlots.map((slot) => ({
  _id: 'photo-' + slot.name, _type: 'sitePhoto', placement: slot.name, title: slot.title,
  existingUrl: slot.url, alt: slot.alt,
}));
