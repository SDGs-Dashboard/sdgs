export const RWANDA_PROVINCES = [
  'Kigali City',
  'East Province',
  'Northern Province',
  'Southern Province',
  'Western Province'
] as const;

export const RWANDA_DISTRICTS = [
  'Bugesera',
  'Gatsibo',
  'Kayonza',
  'Kirehe',
  'Ngoma',
  'Nyagatare',
  'Rwamagana',
  'Burera',
  'Gakenke',
  'Gicumbi',
  'Musanze',
  'Rulindo',
  'Gisagara',
  'Huye',
  'Kamonyi',
  'Muhanga',
  'Nyamagabe',
  'Nyanza',
  'Nyaruguru',
  'Ruhango',
  'Karongi',
  'Ngororero',
  'Nyabihu',
  'Nyamasheke',
  'Rubavu',
  'Rusizi',
  'Rutsiro',
  'Gasabo',
  'Kicukiro',
  'Nyarugenge'
] as const;

export const PROVINCE_ALIASES: Record<string, string> = {
  east: 'East Province',
  eastern: 'East Province',
  'eastern province': 'East Province',
  kigali: 'Kigali City',
  'kigali city': 'Kigali City',
  north: 'Northern Province',
  northern: 'Northern Province',
  'northern province': 'Northern Province',
  south: 'Southern Province',
  southern: 'Southern Province',
  'southern province': 'Southern Province',
  west: 'Western Province',
  western: 'Western Province',
  'western province': 'Western Province'
};

export const LOCATION_ALIASES: Record<string, string> = {
  national: 'Rwanda',
  nationwide: 'Rwanda',
  rwanda: 'Rwanda',
  total: 'Rwanda'
};
