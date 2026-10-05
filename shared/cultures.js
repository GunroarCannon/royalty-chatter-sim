// Cultures and world presets. A culture gives names, houses, places, ruler titles, court offices and a
// line of flavour for the LLM; a preset picks which cultures share the map and how the land looks.
// Humour in Royal Ramble comes from personalities and situations, never from the cultures themselves,
// so regional presets use real names and titles rather than invented "funny" ones.

const SILLY_HOUSE_A = ['Bean', 'Grey', 'Toast', 'Mudd', 'Gold', 'Crow', 'Thistle', 'Ratface', 'Goose', 'Barrow', 'Wick', 'Pickle', 'Stone', 'Fen', 'Hollow', 'Ash', 'Oak', 'Marrow', 'Bramble', 'Cheese', 'Turnip', 'Badger', 'Wren', 'Hare', 'Lark', 'Pudding'];
const SILLY_HOUSE_B = ['', '', '', 'wood', 'ford', 'mere', 'ley', 'wick', 'hold', 'bury', 'shaw', 'stead'];
const SILLY_PLACE_A = ['Wolf', 'Bean', 'Salt', 'Raven', 'Cheese', 'Oat', 'Thorn', 'Mud', 'Frost', 'Goat', 'Sheep', 'Gold', 'Iron', 'Eel', 'Briar', 'Fog', 'Moss', 'Hog', 'Pike', 'Rook', 'Bramble', 'Kettle', 'Owl', 'Plum', 'Ember', 'Marsh', 'Turnip', 'Weasel', 'Butter', 'Swan'];
const SILLY_PLACE_B = ['mark', 'land', 'moor', 'shire', 'vale', 'fell', 'heath', 'ford', 'reach', 'holm', 'wold', 'march', 'dale', 'mouth', 'ness', 'garth', 'by', 'wick'];

export const sillyHouse = rng => rng.pick(SILLY_HOUSE_A) + rng.pick(SILLY_HOUSE_B);
export const sillyPlace = rng => rng.pick(SILLY_PLACE_A) + rng.pick(SILLY_PLACE_B);

const EURO_TITLES = { large: ['King', 'Queen'], mid: ['Duke', 'Duchess'], small: ['Count', 'Countess'] };
const EURO_KINDS = { large: 'Kingdom', mid: 'Duchy', small: 'County' };

// a: portrait archetype (Portrait Atelier heritage). houses/places: arrays, or 'silly'.
// titles/kinds by realm size; roles override court office names; flavour goes into the LLM prompt.
export const CULTURES = {
  // ------------------------------------------------------------------ Europe & the old "known world"
  'western-european': {
    label: 'Western', a: 'northern-european', houses: 'silly', places: 'silly', titles: EURO_TITLES, kinds: EURO_KINDS,
    m: ['Godfrey', 'Baldwin', 'Aldous', 'Percival', 'Edmund', 'Hugh', 'Roland', 'Gerrit', 'Osric', 'Bertram', 'Humbert', 'Reginald', 'Tancred', 'Geoffrey', 'Walter'],
    f: ['Matilda', 'Eleanor', 'Isolde', 'Adela', 'Beatrix', 'Rosamund', 'Gisela', 'Ada', 'Edith', 'Maud', 'Petronilla', 'Alys', 'Joan'],
    flavour: 'a Western European castle court: knights, monks, feasts, jousts and drafty halls',
  },
  'northern-european': {
    label: 'Norse', a: 'northern-european', houses: 'silly', places: 'silly',
    titles: { large: ['King', 'Queen'], mid: ['Jarl', 'Jarl'], small: ['Hersir', 'Hersir'] }, kinds: { large: 'Kingdom', mid: 'Jarldom', small: 'Hold' },
    m: ['Ulf', 'Bjorn', 'Gunnar', 'Halvard', 'Eirik', 'Torvald', 'Sigurd', 'Leif', 'Ragnvald', 'Knut', 'Harald', 'Olaf'],
    f: ['Astrid', 'Sigrid', 'Ingrid', 'Gudrun', 'Ragna', 'Thora', 'Helga', 'Solveig', 'Freydis', 'Ylva'],
    roles: { jester: 'Skald' },
    flavour: 'a Norse hall: longships, mead, skalds and sagas, thing assemblies, very long winters',
  },
  'southern-european': {
    label: 'Southern', a: 'southern-european', houses: 'silly', places: 'silly', titles: EURO_TITLES, kinds: EURO_KINDS,
    m: ['Lorenzo', 'Matteo', 'Alfonso', 'Rodrigo', 'Enzo', 'Bartolo', 'Cosimo', 'Sancho', 'Fabrizio', 'Pietro'],
    f: ['Lucia', 'Isabella', 'Bianca', 'Costanza', 'Urraca', 'Violante', 'Chiara', 'Ottavia', 'Sancha'],
    flavour: 'a Mediterranean court: olive groves, merchant fleets, scheming cardinals, troubadours',
  },
  'eastern-european': {
    label: 'Slavic', a: 'eastern-european', houses: 'silly', places: 'silly',
    titles: { large: ['Tsar', 'Tsaritsa'], mid: ['Knyaz', 'Knyaginya'], small: ['Boyar', 'Boyarina'] }, kinds: { large: 'Tsardom', mid: 'Principality', small: 'Boyardom' },
    m: ['Boris', 'Vlad', 'Mstislav', 'Yaroslav', 'Igor', 'Bogdan', 'Casimir', 'Dobrin', 'Stanimir', 'Oleg'],
    f: ['Olga', 'Milena', 'Zora', 'Ludmila', 'Vesna', 'Dobrava', 'Rada', 'Anastasia', 'Bozena'],
    flavour: 'a Slavic court: boyars in fur hats, onion domes, bear hunts, endless forests',
  },
  'middle-eastern': {
    label: 'Arab', a: 'middle-eastern', houses: 'silly', places: 'silly',
    titles: { large: ['Caliph', 'Sultana'], mid: ['Sultan', 'Sultana'], small: ['Emir', 'Emira'] }, kinds: { large: 'Caliphate', mid: 'Sultanate', small: 'Emirate' },
    m: ['Tariq', 'Yusuf', 'Hakim', 'Idris', 'Karim', 'Rashid', 'Faisal', 'Mansur', 'Zayd', 'Harun'],
    f: ['Layla', 'Zahra', 'Amira', 'Yasmin', 'Samira', 'Nadia', 'Farida', 'Soraya', 'Leila'],
    roles: { chancellor: 'Vizier', priest: 'Qadi', jester: 'Storyteller' },
    flavour: 'an Arab court: viziers, poets, astronomers, desert caravans and splendid gardens',
  },
  'central-asian': {
    label: 'Steppe', a: 'central-asian', houses: 'silly', places: 'silly',
    titles: { large: ['Khagan', 'Khatun'], mid: ['Khan', 'Khatun'], small: ['Bey', 'Hatun'] }, kinds: { large: 'Khaganate', mid: 'Khanate', small: 'Beylik' },
    m: ['Temur', 'Batu', 'Arslan', 'Bolat', 'Kublai', 'Ogedei', 'Aibek', 'Toghrul'],
    f: ['Khutulun', 'Borte', 'Altan', 'Saule', 'Aigerim', 'Sorghaghtani'],
    flavour: 'a steppe horde: gers, horse archers, kumis and a sky that goes on forever',
  },
  'east-asian': {
    label: 'Far Eastern', a: 'east-asian', houses: 'silly', places: 'silly',
    titles: { large: ['Emperor', 'Empress'], mid: ['King', 'Queen'], small: ['Marquis', 'Marquise'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'March' },
    m: ['Jin', 'Hiro', 'Wei', 'Takeshi', 'Min', 'Kenji', 'Bao', 'Ryu', 'Tae'],
    f: ['Mei', 'Yuki', 'Lin', 'Hana', 'Sora', 'Jia', 'Ai', 'Seo-yeon'],
    flavour: 'a far-eastern court: silk banners, tea, scholar-officials and very formal bowing',
  },
  'south-asian': {
    label: 'Indic', a: 'south-asian', houses: 'silly', places: 'silly',
    titles: { large: ['Maharaja', 'Maharani'], mid: ['Raja', 'Rani'], small: ['Thakur', 'Thakurani'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'Principality' },
    m: ['Vikram', 'Arjun', 'Rajendra', 'Harsha', 'Bhoja', 'Aditya', 'Surya', 'Dev'],
    f: ['Padmini', 'Lakshmi', 'Meera', 'Savitri', 'Kamala', 'Gauri', 'Uma'],
    roles: { chancellor: 'Diwan', marshal: 'Senapati', priest: 'Rajguru', jester: 'Vidushaka' },
    flavour: 'an Indian court: elephants, hilltop forts, astrologers, durbars and monsoon rains',
  },
  'north-african': {
    label: 'Maghrebi', a: 'north-african', houses: 'silly', places: 'silly',
    titles: { large: ['Sultan', 'Sultana'], mid: ['Emir', 'Emira'], small: ['Amghar', 'Tamghart'] }, kinds: { large: 'Sultanate', mid: 'Emirate', small: 'Chiefdom' },
    m: ['Yusuf', 'Tashfin', 'Idir', 'Amastan', 'Aksil', 'Massin', 'Ziri', 'Tariq'],
    f: ['Dihya', 'Tinhinan', 'Tiziri', 'Tafsut', 'Thanina', 'Fadma'],
    flavour: 'a Maghrebi court: kasbahs, Saharan caravans, mint tea and councils of elders',
  },
  'west-african': {
    label: 'Sahelian', a: 'west-african', houses: 'silly', places: 'silly',
    titles: { large: ['Mansa', 'Mansa'], mid: ['King', 'Queen'], small: ['Chief', 'Chief'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'Chiefdom' },
    m: ['Kwame', 'Sundiata', 'Musa', 'Ade', 'Kofi', 'Obi', 'Tunde', 'Sekou', 'Chike', 'Ugo'],
    f: ['Nneka', 'Amina', 'Yaa', 'Ife', 'Adaeze', 'Sogolon', 'Zainab', 'Ngozi', 'Abena', 'Folake'],
    roles: { jester: 'Griot' },
    flavour: 'a West African court: griots who remember every lineage, gold, markets and talking drums',
  },
  'east-african': {
    label: 'Horn', a: 'east-african', houses: 'silly', places: 'silly',
    titles: { large: ['Negus', 'Nigist'], mid: ['Ras', 'Woizero'], small: ['Chief', 'Chief'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'Chiefdom' },
    m: ['Dawit', 'Tewodros', 'Yohannes', 'Fasil', 'Gebre', 'Haile', 'Juma', 'Omari'],
    f: ['Taytu', 'Eleni', 'Seble', 'Makeda', 'Almaz', 'Zawadi', 'Rehema'],
    roles: { jester: 'Azmari' },
    flavour: 'an East African court: highland monasteries, coffee ceremonies, monsoon dhows',
  },

  // ------------------------------------------------------------------ Nigeria & West Africa
  yoruba: {
    label: 'Yoruba', a: 'west-african',
    m: ['Adebayo', 'Adewale', 'Babatunde', 'Olumide', 'Oluwaseun', 'Ayodele', 'Kayode', 'Akinola', 'Femi', 'Gbenga', 'Tunde', 'Segun', 'Ademola', 'Oladele', 'Abiodun', 'Olaniyan'],
    f: ['Adunni', 'Folake', 'Funmilayo', 'Yetunde', 'Titilayo', 'Abiola', 'Bisola', 'Morenike', 'Omolara', 'Ronke', 'Ayoola', 'Iyabo', 'Kemi', 'Moradeke', 'Simisola'],
    houses: ['Adeyemi', 'Ogunleye', 'Akinyele', 'Oyelaran', 'Adeleke', 'Ogunbiyi', 'Fashola', 'Olatunji', 'Ajayi', 'Oyewole', 'Akintola', 'Alabi', 'Adegoke', 'Ladipo', 'Olowu', 'Adesanya'],
    places: ['Oyo', 'Ife', 'Ijebu', 'Owo', 'Ondo', 'Ekiti', 'Ilesa', 'Ibadan', 'Abeokuta', 'Ogbomoso', 'Osogbo', 'Iseyin', 'Ede', 'Ikirun', 'Iwo', 'Saki', 'Igboho', 'Ketu', 'Sabe', 'Ila', 'Ilorin', 'Akure', 'Ado', 'Ikere', 'Offa', 'Igbeti', 'Ikorodu', 'Badagry', 'Epe', 'Ijero', 'Otun', 'Ilaro', 'Remo', 'Ipetu', 'Okeho', 'Ilobu'],
    titles: { large: ['Oba', 'Oba'], mid: ['Oba', 'Oba'], small: ['Baale', 'Iyalode'] }, kinds: { large: 'Kingdom', mid: 'Kingdom', small: 'Chiefdom' },
    roles: { chancellor: 'Bashorun', marshal: 'Balogun', steward: 'Parakoyi', spymaster: 'Ilari', priest: 'Babalawo', jester: 'Akewi', spouse: 'Olori' },
    flavour: 'a Yoruba court: the Oba and his chiefs, Ifá divination, talking drums, bustling markets, aso-oke cloth, and proverbs for every occasion',
  },
  igbo: {
    label: 'Igbo', a: 'west-african',
    m: ['Chukwuemeka', 'Obinna', 'Nnamdi', 'Ikenna', 'Chinedu', 'Emeka', 'Uchenna', 'Okonkwo', 'Obiora', 'Chidi', 'Ifeanyi', 'Kelechi', 'Nwankwo', 'Afam', 'Ezeudo'],
    f: ['Ngozi', 'Adaeze', 'Chiamaka', 'Nneka', 'Ifeoma', 'Uchechi', 'Ebele', 'Amarachi', 'Chinwe', 'Obiageli', 'Nkechi', 'Ugochi', 'Adaku', 'Ozioma'],
    houses: ['Okafor', 'Nwosu', 'Okoro', 'Eze', 'Nwachukwu', 'Okeke', 'Obi', 'Onyekachi', 'Uzor', 'Anyanwu', 'Chukwu', 'Okonjo', 'Ibe', 'Nwankwo', 'Agu', 'Ezeh'],
    places: ['Nri', 'Awka', 'Onitsha', 'Arochukwu', 'Owerri', 'Nsukka', 'Enugu', 'Abakaliki', 'Orlu', 'Okigwe', 'Umuahia', 'Nnewi', 'Agulu', 'Udi', 'Ihiala', 'Oguta', 'Ohafia', 'Bende', 'Ngwa', 'Mbaise', 'Ezza', 'Afikpo', 'Obosi', 'Ogidi', 'Igbo-Ukwu', 'Aguleri', 'Umuleri', 'Abiriba', 'Isuochi', 'Item'],
    titles: { large: ['Eze', 'Omu'], mid: ['Obi', 'Omu'], small: ['Onyishi', 'Omu'] }, kinds: { large: 'Kingdom', mid: 'Kingdom', small: 'Village Group' },
    roles: { chancellor: 'Onowu', marshal: 'Ochiagha', priest: 'Dibia', jester: 'Praise-Singer' },
    flavour: 'an Igbo court: the Eze and the council of elders, Ozo titles, Nri priests, yam festivals, masquerades and kola nut hospitality',
  },
  hausa: {
    label: 'Hausa', a: 'west-african',
    m: ['Abdullahi', 'Bello', 'Usman', 'Muhammadu', 'Sule', 'Yakubu', 'Garba', 'Aminu', 'Musa', 'Idris', 'Haruna', 'Lawal', 'Shehu', 'Bawa', 'Danjuma'],
    f: ['Amina', 'Zainab', 'Hauwa', 'Aisha', 'Hadiza', 'Fatima', 'Maryam', 'Halima', 'Binta', 'Rakiya', 'Jamila', 'Safiya', "Asma'u", 'Bilkisu'],
    houses: ['Bagauda', 'Rumfa', 'Kutumbi', 'Dabo', 'Yaji', 'Kumbari', 'Alwali', 'Gijimasu', 'Tsamiya', 'Kanajeji', 'Dauda', 'Bayero', 'Galadanci', 'Daneji', 'Tafida'],
    places: ['Kano', 'Katsina', 'Zazzau', 'Gobir', 'Daura', 'Rano', 'Biram', 'Kebbi', 'Zamfara', 'Sokoto', 'Gwandu', 'Hadejia', 'Katagum', "Jama'are", 'Kazaure', 'Birnin Kudu', 'Dutse', 'Gumel', 'Bauchi', 'Misau', 'Funtua', 'Malumfashi', 'Wudil', 'Bichi', 'Argungu', 'Yauri', 'Maradi', 'Zaria', 'Kafin Hausa', 'Tsanyawa'],
    titles: { large: ['Sarki', 'Sarauniya'], mid: ['Sarki', 'Sarauniya'], small: ['Hakimi', 'Magajiya'] }, kinds: { large: 'Sultanate', mid: 'Emirate', small: 'District' },
    roles: { chancellor: 'Waziri', marshal: 'Madaki', steward: "Ma'aji", priest: 'Limam', jester: 'Maroki' },
    flavour: 'a Hausa city-state: walled birane, the Sarki and his titled officials, Islamic scholars, the dye pits of Kano, Sahel caravans, and horsemen in quilted armour',
  },
  edo: {
    label: 'Edo', a: 'west-african',
    m: ['Ewuare', 'Ozolua', 'Esigie', 'Osagie', 'Osaro', 'Eghosa', 'Efosa', 'Osayande', 'Omoregie', 'Iyamu', 'Aigbe', 'Nosa', 'Uyi', 'Ehigie'],
    f: ['Idia', 'Osarugue', 'Osasu', 'Efe', 'Ivie', 'Imade', 'Isoken', 'Itohan', 'Eki', 'Iyobosa', 'Ewere', 'Omosede', 'Ofure'],
    houses: ['Eweka', 'Ogiamien', 'Osemwegie', 'Igbinedion', 'Uwaifo', 'Ogbebor', 'Edokpolo', 'Osula', 'Arala', 'Okunbor', 'Ihama', 'Ekhator'],
    places: ['Edo', 'Udo', 'Uromi', 'Ekpoma', 'Irrua', 'Ubiaja', 'Igueben', 'Ewohimi', 'Ewu', 'Afuze', 'Auchi', 'Okpekpe', 'Usen', 'Ugo', 'Iguobazuwa', 'Ehor', 'Abudu', 'Igarra', 'Fugar', 'Uzebba', 'Ologbo', 'Ugbine'],
    titles: { large: ['Oba', 'Oba'], mid: ['Enogie', 'Enogie'], small: ['Odionwere', 'Odionwere'] }, kinds: { large: 'Kingdom', mid: 'Dukedom', small: 'Village' },
    roles: { chancellor: 'Iyase', marshal: 'Ezomo', priest: 'Ohen' },
    flavour: 'the court of Benin: the Oba\'s palace hung with bronze plaques, guilds of brass-casters and ivory carvers, coral beads, and chiefs of the palace and the town',
  },
  kanuri: {
    label: 'Kanuri', a: 'west-african',
    m: ['Idris', 'Dunama', 'Ali', 'Umar', 'Kyari', 'Bukar', 'Modu', 'Ibrahim', 'Abba', 'Mustapha', 'Babagana', 'Kolo'],
    f: ['Aisa', 'Fanna', 'Zara', 'Yagana', 'Falmata', 'Kaltumi', 'Gumsu', 'Amina', 'Hadiza', 'Bintu'],
    houses: ['Sayfawa', 'Kanemi', 'Magumi', 'Duguwa', 'Tomaghra', 'Kuburi', 'Bulala', 'Ngalma', 'Kai', 'Kayi'],
    places: ['Bornu', 'Kanem', 'Ngazargamu', 'Kukawa', 'Dikwa', 'Monguno', 'Gajiram', 'Bama', 'Gwoza', 'Biu', 'Damasak', 'Mobbar', 'Marte', 'Ngala', 'Kaga', 'Konduga', 'Mafa', 'Gubio', 'Nguru', 'Geidam', 'Mandara', 'Logone'],
    titles: { large: ['Mai', 'Magira'], mid: ['Mai', 'Magira'], small: ['Lawan', 'Lawan'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'District' },
    roles: { chancellor: 'Waziri', marshal: 'Kaigama', priest: 'Imam' },
    flavour: 'Kanem-Bornu: the Mai\'s court, armoured cavalry, Lake Chad, trans-Saharan caravans and Islamic scholarship',
  },
  fulani: {
    label: 'Fulani', a: 'west-african',
    m: ['Usman', 'Buba', 'Hamman', 'Bello', 'Adamu', 'Modibbo', 'Sambo', 'Gidado', 'Hamidu', 'Jidda', 'Ardo', 'Mamman'],
    f: ['Nana', "Asma'u", 'Inna', 'Jummai', 'Ladi', 'Kande', 'Dije', 'Hadiza', 'Aishatu', 'Habiba'],
    houses: ['Torodbe', 'Sullubawa', 'Jobawa', 'Yerimawa', 'Ba', 'Jallo', 'Barry', 'Sow', 'Bah', 'Sidibe'],
    places: ['Yola', 'Mubi', 'Jalingo', 'Song', 'Gombe', 'Muri', 'Ngaoundere', 'Girei', 'Fufore', 'Ganye', 'Toungo', 'Gurin', 'Belel', 'Maiha', 'Verre', 'Mayo Belwa'],
    titles: { large: ['Lamido', 'Lamido'], mid: ['Lamido', 'Lamido'], small: ['Ardo', 'Ardo'] }, kinds: { large: 'Emirate', mid: 'Emirate', small: 'Clan Land' },
    roles: { chancellor: 'Waziri', priest: 'Modibbo', jester: 'Praise-Singer' },
    flavour: 'a Fulani emirate: cattle herds and pastures, the Lamido and the Ardo, Islamic learning, and poetry recited from memory',
  },
  ijaw: {
    label: 'Ijaw', a: 'west-african',
    m: ['Dagogo', 'Tonye', 'Boma', 'Tamuno', 'Pere', 'Tarila', 'Preye', 'Timi', 'Ebimobowei', 'Alabo', 'Ibiba', 'Sokari'],
    f: ['Ebiere', 'Ebiye', 'Ibinabo', 'Boma', 'Preye', 'Tamara', 'Ere', 'Ayibakuro', 'Seiyefa', 'Diepreye'],
    houses: ['Pepple', 'Jaja', 'Amachree', 'Braide', 'Briggs', 'Dappa', 'Harry', 'Manuel', 'Sekibo', 'Kalio'],
    places: ['Bonny', 'Kalabari', 'Okrika', 'Nembe', 'Brass', 'Opobo', 'Twon', 'Buguma', 'Abonnema', 'Bakana', 'Degema', 'Ogbia', 'Sagbama', 'Kaiama', 'Oporoma', 'Odi', 'Patani', 'Ekeremor'],
    titles: { large: ['Amanyanabo', 'Amanyanabo'], mid: ['Amanyanabo', 'Amanyanabo'], small: ['Chief', 'Chief'] }, kinds: { large: 'Kingdom', mid: 'Kingdom', small: 'Canoe House' },
    flavour: 'a Niger Delta trading state: canoe houses and war canoes, the Amanyanabo, creeks and mangroves, and very shrewd traders',
  },
  efik: {
    label: 'Efik', a: 'west-african',
    m: ['Effiong', 'Edet', 'Asuquo', 'Bassey', 'Okon', 'Eyo', 'Ekpo', 'Archibong', 'Etim', 'Ita', 'Nsa', 'Orok'],
    f: ['Affiong', 'Arit', 'Ekaete', 'Eno', 'Nkoyo', 'Adiaha', 'Iquo', 'Ima', 'Uduak', 'Imaobong'],
    houses: ['Duke', 'Eyo', 'Archibong', 'Henshaw', 'Cobham', 'Ephraim', 'Effiom', 'Ekpo', 'Asuquo', 'Edem'],
    places: ['Calabar', 'Creek Town', 'Duke Town', 'Henshaw Town', 'Obutong', 'Adiabo', 'Ikot Ansa', 'Akpabuyo', 'Oron', 'Ikot Ekpene', 'Uyo', 'Eket', 'Itu', 'Ibeno', 'Odukpani'],
    titles: { large: ['Obong', 'Obong'], mid: ['Obong', 'Obong'], small: ['Etubom', 'Etubom'] }, kinds: { large: 'Kingdom', mid: 'Kingdom', small: 'Town' },
    flavour: 'Old Calabar: great trading houses, the Ekpe society, the Obong, river trade and nsibidi signs',
  },
  mande: {
    label: 'Mande', a: 'west-african',
    m: ['Sundiata', 'Musa', 'Sakura', 'Maghan', 'Souleymane', 'Sekou', 'Mamadou', 'Bakary', 'Moussa', 'Fakoli', 'Tiramakan', 'Bala'],
    f: ['Sogolon', 'Kassa', 'Nana', 'Mariam', 'Fatoumata', 'Kadiatou', 'Djeneba', 'Aminata', 'Oumou', 'Sira', 'Kankou'],
    houses: ['Keita', 'Traoré', 'Konaté', 'Camara', 'Kouyaté', 'Diarra', 'Coulibaly', 'Sissoko', 'Touré', 'Cissé', 'Kanté', 'Dembélé'],
    places: ['Niani', 'Kangaba', 'Timbuktu', 'Djenné', 'Gao', 'Walata', 'Kaarta', 'Segou', 'Kirina', 'Siby', 'Mopti', 'Nioro', 'Kita', 'Koulikoro', 'Sikasso', 'Bougouni', 'Kayes', 'San', 'Banamba', 'Kela'],
    titles: { large: ['Mansa', 'Mansa'], mid: ['Mansa', 'Mansa'], small: ['Dugutigi', 'Dugutigi'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'Village' },
    roles: { priest: 'Imam', jester: 'Jeli' },
    flavour: 'the Mali Empire: the Mansa, jeli griots who remember every lineage, Timbuktu scholars, Bambuk gold, salt caravans and the great Niger river',
  },
  akan: {
    label: 'Akan', a: 'west-african',
    m: ['Kwame', 'Kofi', 'Kwaku', 'Yaw', 'Kwabena', 'Kojo', 'Kwasi', 'Osei', 'Opoku', 'Agyeman', 'Kwadwo', 'Prempeh'],
    f: ['Akua', 'Ama', 'Abena', 'Afua', 'Adwoa', 'Yaa', 'Akosua', 'Efua', 'Esi', 'Akyaa'],
    houses: ['Oyoko', 'Agona', 'Asona', 'Aduana', 'Bretuo', 'Asakyiri', 'Ekuona', 'Asenie'],
    places: ['Kumasi', 'Kwaman', 'Mampong', 'Juaben', 'Bekwai', 'Kokofu', 'Nsuta', 'Offinso', 'Ejisu', 'Denkyira', 'Akwamu', 'Akyem', 'Techiman', 'Bono Manso', 'Wenchi', 'Sefwi', 'Wassa', 'Assin', 'Twifo', 'Adansi', 'Elmina', 'Begoro', 'Abetifi'],
    titles: { large: ['Ohene', 'Ohemaa'], mid: ['Ohene', 'Ohemaa'], small: ['Odikro', 'Odikro'] }, kinds: { large: 'Kingdom', mid: 'State', small: 'Town' },
    roles: { chancellor: 'Okyeame', marshal: 'Krontihene', steward: 'Sanaahene', priest: 'Okomfo', jester: 'Praise-Singer' },
    flavour: 'an Akan state: the Ohene and the Queen Mother, linguists with carved staffs, kente weavers, gold weights and Adinkra symbols',
  },
  wolof: {
    label: 'Wolof', a: 'west-african',
    m: ['Amari', 'Biram', 'Samba', 'Moussa', 'Mbaye', 'Alboury', 'Babacar', 'Ndiaga', 'Lamine', 'Ousmane', 'Cheikh', 'Latsukaabe'],
    f: ['Ndate', 'Fatou', 'Awa', 'Coumba', 'Mame', 'Khady', 'Astou', 'Aissatou', 'Ndeye', 'Sokhna', 'Rokhaya'],
    houses: ['Fall', 'Diop', 'Ndiaye', 'Sall', 'Gueye', 'Faye', 'Sarr', 'Ndoye', 'Diouf', 'Seck', 'Thiam', 'Niang'],
    places: ['Kajoor', 'Jolof', 'Waalo', 'Baol', 'Sine', 'Saloum', 'Rufisque', 'Mbour', 'Thies', 'Louga', 'Tivaouane', 'Kebemer', 'Diourbel', 'Kaolack', 'Fatick', 'Dagana', 'Podor', 'Mekhe', 'Joal', 'Ngaye'],
    titles: { large: ['Bourba', 'Linguère'], mid: ['Damel', 'Linguère'], small: ['Laman', 'Laman'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'Lamanate' },
    roles: { jester: 'Géwël' },
    flavour: 'the Wolof kingdoms of Senegambia: the Damel and the Linguère, géwël griots, cavalry, millet fields, wrestling and the Atlantic coast',
  },
  amhara: {
    label: 'Ethiopian', a: 'east-african',
    m: ['Dawit', 'Tewodros', 'Yohannes', 'Fasil', 'Iyasu', 'Gebre', 'Tekle', 'Haile', 'Bekele', 'Kebede', 'Lalibela', 'Zara Yaqob'],
    f: ['Taytu', 'Mentewab', 'Eleni', 'Seble', 'Makeda', 'Mekdes', 'Selam', 'Tsehay', 'Almaz', 'Hirut', 'Yodit', 'Worknesh'],
    houses: ['Tesfaye', 'Alemu', 'Gebremedhin', 'Wolde', 'Mengesha', 'Kassa', 'Abebe', 'Desta', 'Negash', 'Tadesse', 'Zagwe', 'Yekuno'],
    places: ['Aksum', 'Lalibela', 'Gondar', 'Lasta', 'Tigray', 'Gojjam', 'Shewa', 'Begemder', 'Wollo', 'Ankober', 'Debre Tabor', 'Adwa', 'Magdala', 'Debre Markos', 'Yeha', 'Adulis', 'Entoto', 'Bahir Dar', 'Dessie', 'Simien'],
    titles: { large: ['Negus', 'Nigist'], mid: ['Ras', 'Woizero'], small: ['Dejazmach', 'Woizero'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'Governorate' },
    roles: { chancellor: 'Tsehafi Tezaz', marshal: 'Fitawrari', jester: 'Azmari' },
    flavour: 'the Ethiopian highlands: the Negus and his Rases, rock-hewn churches, coffee ceremonies, injera feasts and azmari minstrels with the masenqo',
  },
  swahili: {
    label: 'Swahili', a: 'east-african',
    m: ['Ali', 'Hassan', 'Bakari', 'Juma', 'Omari', 'Salim', 'Rashidi', 'Mwinyi', 'Hamisi', 'Athumani', 'Shaaban', 'Abdallah'],
    f: ['Mwanaisha', 'Zuhura', 'Mwajuma', 'Halima', 'Rehema', 'Amina', 'Fatma', 'Zawadi', 'Saida', 'Subira', 'Tatu'],
    houses: ['Mazrui', 'Nabhani', 'Shirazi', 'Mafazi', 'Hadrami', 'Barwani', 'Mandhry', 'Kharusi'],
    places: ['Kilwa', 'Mombasa', 'Malindi', 'Lamu', 'Pate', 'Zanzibar', 'Pemba', 'Mafia', 'Sofala', 'Gedi', 'Bagamoyo', 'Pangani', 'Tanga', 'Siyu', 'Faza', 'Manda', 'Shanga', 'Barawa', 'Kaole', 'Mtwapa', 'Vanga'],
    titles: { large: ['Sultan', 'Sultana'], mid: ['Sultan', 'Sultana'], small: ['Diwani', 'Diwani'] }, kinds: { large: 'Sultanate', mid: 'City-State', small: 'Town' },
    roles: { chancellor: 'Wazir', priest: 'Kadhi', jester: 'Storyteller' },
    flavour: 'the Swahili coast: coral-stone towns, dhows riding the monsoon, gold and ivory merchants, spices and taarab poetry',
  },
  zulu: {
    label: 'Nguni', a: 'west-african',
    m: ['Senzangakhona', 'Dingane', 'Mpande', 'Cetshwayo', 'Sipho', 'Themba', 'Bongani', 'Mandla', 'Sibusiso', 'Jabulani', 'Mondli', 'Zwide'],
    f: ['Nandi', 'Mkabayi', 'Thandi', 'Nomvula', 'Zanele', 'Lindiwe', 'Ntombi', 'Nokuthula', 'Sibongile', 'Thandeka'],
    houses: ['Zulu', 'Buthelezi', 'Mthethwa', 'Ndwandwe', 'Qwabe', 'Khumalo', 'Ntuli', 'Dlamini', 'Zungu', 'Mkhize', 'Cele', 'Shezi'],
    places: ['kwaBulawayo', 'Ulundi', 'Nongoma', 'Eshowe', 'Mahlabathini', 'Babanango', 'Nkandla', 'Mtubatuba', 'Hlobane', 'Isandlwana', 'Gingindlovu', 'Empangeni', 'Ondini', 'Dukuza', 'Mgungundlovu', 'Hlabisa', 'Mkhuze', 'Ngome'],
    titles: { large: ['Inkosi', 'Inkosikazi'], mid: ['Inkosi', 'Inkosikazi'], small: ['Induna', 'Induna'] }, kinds: { large: 'Kingdom', mid: 'Chiefdom', small: 'Homestead' },
    roles: { chancellor: 'Induna', marshal: 'Impi Commander', priest: 'Isangoma', jester: 'Imbongi' },
    flavour: 'an Nguni kingdom: the royal homestead, age regiments, cattle as wealth, izibongo praise poetry and beadwork carrying hidden messages',
  },
  berber: {
    label: 'Amazigh', a: 'north-african',
    m: ['Yusuf', 'Tashfin', 'Masinissa', 'Tariq', 'Idir', 'Amastan', 'Aksil', 'Massin', 'Juba', 'Ziri', 'Yugurten'],
    f: ['Dihya', 'Tinhinan', 'Tiziri', 'Tanirt', 'Lalla', 'Fadma', 'Taziri', 'Thanina', 'Tafsut', 'Tamimt'],
    houses: ['Zenata', 'Sanhaja', 'Masmuda', 'Kutama', 'Lamtuna', 'Hawwara', 'Zirid', 'Hammadid'],
    places: ['Tlemcen', 'Fez', 'Marrakesh', 'Sijilmasa', 'Tahert', 'Kairouan', 'Bejaia', 'Aghmat', 'Tinmel', 'Agadir', 'Taza', 'Meknes', 'Ouarzazate', 'Ghadames', 'Tiznit', 'Biskra', 'Ghardaia', 'Tozeur', 'Gafsa', 'Siwa', 'Ifrane', 'Azrou'],
    titles: { large: ['Sultan', 'Sultana'], mid: ['Emir', 'Emira'], small: ['Amghar', 'Tamghart'] }, kinds: { large: 'Sultanate', mid: 'Emirate', small: 'Tribal Land' },
    roles: { chancellor: 'Vizier', priest: 'Qadi' },
    flavour: 'Amazigh North Africa: kasbahs in the Atlas, caravans to Sijilmasa, indigo veils, mint tea and councils of elders',
  },

  // ------------------------------------------------------------------ Asia
  han: {
    label: 'Han', a: 'east-asian',
    m: ['Wei', 'Jian', 'Liang', 'Ming', 'Bo', 'Hao', 'Qiang', 'Yong', 'Gang', 'Tao', 'Ping', 'Lei', 'Feng', 'Jun'],
    f: ['Mei', 'Lan', 'Ying', 'Hua', 'Xiu', 'Fang', 'Yan', 'Jing', 'Xia', 'Lian', 'Qing', 'Yun', 'Zhen'],
    houses: ['Li', 'Wang', 'Zhang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Zhou', 'Wu', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo'],
    places: ["Chang'an", 'Luoyang', 'Kaifeng', 'Hangzhou', 'Jinling', 'Chengdu', 'Yangzhou', 'Suzhou', 'Taiyuan', 'Xiangyang', 'Jiangling', 'Guangzhou', 'Quanzhou', 'Youzhou', 'Liangzhou', 'Dunhuang', 'Jingzhou', 'Qingzhou', 'Xuzhou', 'Shouchun', 'Handan', 'Linzi', 'Wuchang', 'Changsha', 'Fuzhou', 'Shaoxing', 'Mingzhou'],
    titles: { large: ['Emperor', 'Empress'], mid: ['King', 'Queen'], small: ['Marquis', 'Marquise'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'Marquisate' },
    roles: { chancellor: 'Grand Chancellor', marshal: 'General', steward: 'Minister of Revenue', spymaster: 'Eunuch Spymaster', priest: 'Court Astrologer', jester: 'Court Storyteller' },
    flavour: 'a Chinese court: scholar-officials and examinations, silk and porcelain, tea, dragon banners, eunuchs, poetry contests and strict propriety',
  },
  japanese: {
    label: 'Japanese', a: 'east-asian',
    m: ['Takeshi', 'Hiroshi', 'Kenji', 'Masamune', 'Yoshitsune', 'Kiyomori', 'Shingen', 'Kenshin', 'Tadakatsu', 'Kagetora', 'Munenori', 'Yukimura', 'Nobuyuki'],
    f: ['Tomoe', 'Masako', 'Hana', 'Yuki', 'Chiyo', 'Ume', 'Sakura', 'Akane', 'Nene', 'Oichi', 'Kiku', 'Haru'],
    houses: ['Minamoto', 'Taira', 'Fujiwara', 'Hojo', 'Ashikaga', 'Takeda', 'Uesugi', 'Oda', 'Tokugawa', 'Date', 'Mori', 'Shimazu', 'Imagawa', 'Sanada', 'Chosokabe', 'Otomo'],
    places: ['Kyoto', 'Nara', 'Kamakura', 'Edo', 'Owari', 'Mikawa', 'Kai', 'Echigo', 'Satsuma', 'Mutsu', 'Dewa', 'Musashi', 'Sagami', 'Suruga', 'Omi', 'Mino', 'Settsu', 'Harima', 'Bizen', 'Aki', 'Nagato', 'Tosa', 'Higo', 'Bungo', 'Hizen', 'Shinano', 'Kaga', 'Noto', 'Izumo'],
    titles: { large: ['Shogun', 'Shogun'], mid: ['Daimyo', 'Daimyo'], small: ['Lord', 'Lady'] }, kinds: { large: 'Shogunate', mid: 'Domain', small: 'Fief' },
    roles: { chancellor: 'Karō', marshal: 'Samurai Commander', steward: 'Bugyō', spymaster: 'Shinobi Master', priest: 'Monk', jester: 'Otogishū' },
    flavour: 'feudal Japan: daimyo and samurai retainers, castle towns, tea ceremonies, haiku, cherry blossoms and monks with strong opinions',
  },
  korean: {
    label: 'Korean', a: 'east-asian',
    m: ['Minho', 'Jaewon', 'Seokjin', 'Hyunwoo', 'Taeyang', 'Donghyun', 'Sungmin', 'Jihoon', 'Youngsoo', 'Kyungsoo', 'Geon', 'Seonggye'],
    f: ['Seoyeon', 'Jiwoo', 'Minji', 'Hyejin', 'Soojin', 'Eunji', 'Yuna', 'Haeun', 'Jisoo', 'Sunhee', 'Mihee'],
    houses: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Yoon', 'Jang', 'Lim', 'Han', 'Shin', 'Oh'],
    places: ['Gaegyeong', 'Hanyang', 'Gyeongju', 'Pyongyang', 'Jeonju', 'Gwangju', 'Hamhung', 'Wonju', 'Chungju', 'Gongju', 'Sangju', 'Andong', 'Jinju', 'Naju', 'Haeju', 'Uiju', 'Dongnae', 'Cheongju', 'Hongju', 'Gangneung', 'Chuncheon', 'Suwon'],
    titles: { large: ['King', 'Queen'], mid: ['Prince', 'Princess'], small: ['Magistrate', 'Magistrate'] }, kinds: { large: 'Kingdom', mid: 'Principality', small: 'County' },
    roles: { chancellor: 'Chief State Councillor', marshal: 'General', priest: 'Court Astronomer', jester: 'Pansori Singer' },
    flavour: 'a Korean court: yangban scholars, hanbok silks, kimchi jars, archery contests and royal annals that record everything the king says',
  },
  mongol: {
    label: 'Mongol', a: 'central-asian',
    m: ['Temujin', 'Batu', 'Ogedei', 'Mongke', 'Kublai', 'Hulagu', 'Jochi', 'Chagatai', 'Tolui', 'Subutai', 'Jebe', 'Arik'],
    f: ['Borte', 'Hoelun', 'Sorghaghtani', 'Khutulun', 'Mandukhai', 'Toregene', 'Oghul', 'Chabi', 'Altani', 'Yesui'],
    houses: ['Borjigin', 'Jalair', 'Kerait', 'Naiman', 'Merkit', 'Tatar', 'Onggirat', 'Oirat', 'Baarin', 'Uriankhai', 'Taichiud'],
    places: ['Karakorum', 'Onon', 'Kherlen', 'Tuul', 'Orkhon', 'Khangai', 'Altai', 'Gobi', 'Selenge', 'Khentii', 'Burqan', 'Dzungaria', 'Ordos', 'Ili', 'Khovd', 'Uliastai', 'Avarga', 'Shangdu'],
    titles: { large: ['Khagan', 'Khatun'], mid: ['Khan', 'Khatun'], small: ['Noyan', 'Khatun'] }, kinds: { large: 'Khaganate', mid: 'Khanate', small: 'Ulus' },
    roles: { marshal: 'Tumen Commander', priest: 'Shaman', jester: 'Throat Singer' },
    flavour: 'the steppe: gers and herds, horse archers, kumis, the kurultai assembly and the eternal blue sky',
  },
  khmer: {
    label: 'Khmer', a: 'southeast-asian',
    m: ['Jayavarman', 'Suryavarman', 'Yasovarman', 'Indravarman', 'Sok', 'Chann', 'Dara', 'Rith', 'Vannak', 'Sophal', 'Pich'],
    f: ['Indradevi', 'Jayarajadevi', 'Sophea', 'Chenda', 'Srey', 'Bopha', 'Kalyan', 'Mealea', 'Sokha', 'Chantrea'],
    houses: ['Chey', 'Sok', 'Chan', 'Keo', 'Heng', 'Ouk', 'Pen', 'Prak', 'Sam', 'Chea'],
    places: ['Angkor', 'Yasodharapura', 'Koh Ker', 'Phimai', 'Lopburi', 'Sambor', 'Hariharalaya', 'Preah Vihear', 'Battambang', 'Kampot', 'Udong', 'Longvek', 'Wat Phu', 'Beng Mealea', 'Prey Nokor', 'Kampong Thom', 'Siem Reap', 'Banteay Chhmar'],
    titles: { large: ['King', 'Queen'], mid: ['Prince', 'Princess'], small: ['Governor', 'Governor'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'Province' },
    roles: { priest: 'Brahmin', jester: 'Court Dancer' },
    flavour: 'the Khmer court: temple-mountains, great reservoirs, apsara dancers, war elephants and stone inscriptions listing everyone\'s merits',
  },
  viet: {
    label: 'Viet', a: 'southeast-asian',
    m: ['Hung', 'Quang', 'Minh', 'Thanh', 'Duc', 'Tuan', 'Hai', 'Long', 'Nam', 'Phong', 'Bao', 'Khanh'],
    f: ['Lan', 'Mai', 'Hoa', 'Linh', 'Thu', 'Huong', 'Ngoc', 'Phuong', 'Thao', 'Trinh', 'An'],
    houses: ['Ly', 'Tran', 'Le', 'Nguyen', 'Dinh', 'Ngo', 'Ho', 'Trinh', 'Mac', 'Pham', 'Vo', 'Dang'],
    places: ['Thang Long', 'Hoa Lu', 'Phu Xuan', 'Thanh Hoa', 'Nghe An', 'Co Loa', 'Van Don', 'Hai Duong', 'Son Tay', 'Lang Son', 'Quang Nam', 'Hoi An', 'Cao Bang', 'Tuyen Quang', 'Bac Ninh', 'Nam Dinh', 'Thai Binh', 'Ninh Binh', 'Phu Yen', 'Vijaya'],
    titles: { large: ['Emperor', 'Empress'], mid: ['King', 'Queen'], small: ['Marquis', 'Marquise'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'Prefecture' },
    roles: { chancellor: 'Grand Chancellor', marshal: 'General', priest: 'Monk', jester: 'Water Puppeteer' },
    flavour: 'Đại Việt: the dragon throne at Thăng Long, mandarins, rice terraces, water puppets, bronze drums and river fleets',
  },
  hindustani: {
    label: 'Rajput', a: 'south-asian',
    m: ['Prithviraj', 'Vikram', 'Arjun', 'Rajendra', 'Harsha', 'Bhoja', 'Udai', 'Jai', 'Dev', 'Aditya', 'Surya', 'Hammir'],
    f: ['Padmini', 'Lakshmi', 'Durgavati', 'Ahilya', 'Meera', 'Savitri', 'Kamala', 'Gauri', 'Uma', 'Kalyani', 'Devika', 'Karnavati'],
    houses: ['Chauhan', 'Rathore', 'Sisodia', 'Kachwaha', 'Parmar', 'Solanki', 'Tomar', 'Gahadavala', 'Chandela', 'Pratihara', 'Pala', 'Sena', 'Bhati', 'Jadeja'],
    places: ['Ajmer', 'Dhillika', 'Kannauj', 'Chittor', 'Mewar', 'Marwar', 'Amber', 'Jaisalmer', 'Malwa', 'Ujjain', 'Dhar', 'Gwalior', 'Mathura', 'Kashi', 'Prayag', 'Ayodhya', 'Pataliputra', 'Gaur', 'Kalinga', 'Anhilwara', 'Mandu', 'Bikaner', 'Bundi', 'Kota', 'Mahoba', 'Kalinjar', 'Ranthambore'],
    titles: { large: ['Maharaja', 'Maharani'], mid: ['Raja', 'Rani'], small: ['Thakur', 'Thakurani'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'Thikana' },
    roles: { chancellor: 'Diwan', marshal: 'Senapati', steward: 'Treasurer', priest: 'Rajguru', jester: 'Vidushaka', spouse: 'Rani' },
    flavour: 'a Rajput court: hilltop forts, war elephants, bards and astrologers, durbar ceremonies, chaturanga and monsoon rains',
  },
  tamil: {
    label: 'Tamil', a: 'south-asian',
    m: ['Rajaraja', 'Rajendra', 'Karikala', 'Kulothunga', 'Aditya', 'Parantaka', 'Senguttuvan', 'Kannan', 'Muthu', 'Selvam', 'Arul', 'Ilango'],
    f: ['Kundavai', 'Sembiyan', 'Mangai', 'Kannagi', 'Madhavi', 'Meenakshi', 'Valli', 'Thamarai', 'Ponni', 'Nila', 'Kayal', 'Malar'],
    houses: ['Chola', 'Pandya', 'Chera', 'Pallava', 'Velir', 'Chalukya', 'Hoysala', 'Kadamba', 'Ganga', 'Kongu'],
    places: ['Thanjavur', 'Madurai', 'Uraiyur', 'Kanchipuram', 'Mamallapuram', 'Korkai', 'Kaveripattinam', 'Karur', 'Tirunelveli', 'Ramanathapuram', 'Tiruchirappalli', 'Nagapattinam', 'Kumbakonam', 'Pudukkottai', 'Vellore', 'Salem', 'Kollam', 'Muziris', 'Rameswaram', 'Chidambaram'],
    titles: { large: ['Emperor', 'Empress'], mid: ['Raja', 'Rani'], small: ['Velir', 'Velir'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'Nadu' },
    roles: { chancellor: 'Chief Minister', marshal: 'Senapati', priest: 'Temple Priest', jester: 'Court Poet' },
    flavour: 'a Tamil court: towering temple gopurams, bronze sculptors, Sangam poetry, sea trade to the spice islands and carnatic music',
  },
  persian: {
    label: 'Persian', a: 'middle-eastern',
    m: ['Bahram', 'Khosrow', 'Ardashir', 'Shapur', 'Rostam', 'Kaveh', 'Farhad', 'Dariush', 'Jamshid', 'Kourosh', 'Babak', 'Mehrdad'],
    f: ['Shirin', 'Parisa', 'Roxana', 'Azadeh', 'Farideh', 'Golnar', 'Mahsa', 'Nasrin', 'Parvaneh', 'Shahrzad', 'Soraya', 'Yasaman'],
    houses: ['Sasanid', 'Buyid', 'Samanid', 'Ziyarid', 'Tahirid', 'Saffarid', 'Kakuyid', 'Bavandid', 'Dabuyid', 'Farighunid', 'Ghurid', 'Mihranid'],
    places: ['Isfahan', 'Shiraz', 'Tabriz', 'Nishapur', 'Merv', 'Herat', 'Rayy', 'Hamadan', 'Kerman', 'Yazd', 'Qazvin', 'Tus', 'Balkh', 'Bukhara', 'Samarkand', 'Ctesiphon', 'Susa', 'Kashan', 'Qom', 'Gorgan', 'Sari', 'Amol', 'Ardabil', 'Zanjan'],
    titles: { large: ['Shahanshah', 'Banbishn'], mid: ['Shah', 'Shahbanu'], small: ['Marzban', 'Banu'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'March' },
    roles: { chancellor: 'Vizier', marshal: 'Spahbed', priest: 'Court Astrologer', jester: 'Dalqak' },
    flavour: 'a Persian court: walled gardens with fountains, Shahnameh recitations, carpets and miniatures, polo, astrologers and nightingale poetry',
  },
  malay: {
    label: 'Malay', a: 'southeast-asian',
    m: ['Parameswara', 'Iskandar', 'Mahmud', 'Muzaffar', 'Mansur', 'Ahmad', 'Ismail', 'Razak', 'Ibrahim', 'Yusof', 'Tuah', 'Jebat'],
    f: ['Puteri', 'Siti', 'Fatimah', 'Aishah', 'Mariam', 'Melati', 'Kesuma', 'Mawar', 'Intan', 'Zubaidah', 'Teratai', 'Mahsuri'],
    houses: ['Melaka', 'Johor', 'Pahang', 'Perak', 'Kedah', 'Terengganu', 'Kelantan', 'Siak', 'Palembang', 'Bintan'],
    places: ['Melaka', 'Johor', 'Pahang', 'Perak', 'Kedah', 'Terengganu', 'Kelantan', 'Patani', 'Brunei', 'Palembang', 'Jambi', 'Aceh', 'Pasai', 'Riau', 'Lingga', 'Selangor', 'Temasek', 'Siak', 'Bintan', 'Langkasuka', 'Beruas', 'Muar', 'Pekan'],
    titles: { large: ['Sultan', 'Sultanah'], mid: ['Sultan', 'Sultanah'], small: ['Datuk', 'Datin'] }, kinds: { large: 'Sultanate', mid: 'Sultanate', small: 'Chiefdom' },
    roles: { chancellor: 'Bendahara', marshal: 'Laksamana', steward: 'Penghulu Bendahari', spymaster: 'Temenggong', priest: 'Kadi', jester: 'Penglipur Lara' },
    flavour: 'the Malay world: the Sultan\'s istana, monsoon trade at Melaka, keris daggers, pantun verse, spice ships and the Laksamana\'s fleet',
  },
  tibetan: {
    label: 'Tibetan', a: 'central-asian',
    m: ['Songtsen', 'Trisong', 'Ralpachen', 'Tenzin', 'Lobsang', 'Dorje', 'Tashi', 'Norbu', 'Karma', 'Sonam', 'Jigme'],
    f: ['Yeshe', 'Dolma', 'Pema', 'Lhamo', 'Dechen', 'Tsering', 'Yangchen', 'Kunsang', 'Choden', 'Drolma'],
    houses: ['Yarlung', 'Lang', 'Ba', 'Nanam', 'Chim', 'Bro', 'Khon', 'Phagmodru'],
    places: ['Lhasa', 'Yarlung', 'Shigatse', 'Gyantse', 'Tsang', 'Kham', 'Amdo', 'Guge', 'Ngari', 'Sakya', 'Samye', 'Tsetang', 'Chamdo', 'Nyingchi', 'Lhoka', 'Tsaparang', 'Mustang', 'Ladakh', 'Derge'],
    titles: { large: ['Tsenpo', 'Tsenmo'], mid: ['Gyalpo', 'Gyalmo'], small: ['Chieftain', 'Chieftain'] }, kinds: { large: 'Empire', mid: 'Kingdom', small: 'Valley' },
    roles: { priest: 'Lama', jester: 'Wandering Bard' },
    flavour: 'the high plateau: cliffside monasteries, butter tea, prayer flags, yak caravans and monks who debate by clapping',
  },
};

// climate drives map colour and the little trees: temperate (oaks & pines), tropical (palms, savanna, rainforest), arid, mixed
export const PRESETS = {
  world: {
    label: 'The Known World', icon: '🌍', climate: 'temperate',
    desc: 'Every culture on one silly map.',
    cultures: [['northern-european', 3], ['western-european', 3], ['southern-european', 3], ['eastern-european', 2], ['middle-eastern', 2], ['north-african', 1.5], ['west-african', 2], ['east-african', 1], ['central-asian', 1.5], ['east-asian', 1], ['south-asian', 1]],
    silly: true,
  },
  europe: {
    label: 'Old Europe', icon: '🏰', climate: 'temperate',
    desc: 'Knights, jarls and boyars.',
    cultures: [['western-european', 4], ['northern-european', 2.5], ['southern-european', 3], ['eastern-european', 2.5]],
    silly: true,
  },
  nigeria: {
    label: 'Nigeria', icon: '🥁', climate: 'tropical',
    food: { name: 'palm wine', Name: 'Palm Wine', epithet: 'the Palm-Wine Tapper', insult: 'calabash-headed fool' },
    desc: 'Obas, Ezes, Emirs and the court of Benin.',
    cultures: [['yoruba', 4], ['igbo', 3.5], ['hausa', 4], ['edo', 2], ['kanuri', 1.5], ['fulani', 1.5], ['ijaw', 1.2], ['efik', 1]],
    setting: 'pre-colonial Nigeria (lighthearted and affectionate, never stereotyped)',
  },
  africa: {
    label: 'Africa', icon: '🌍', climate: 'tropical',
    food: { name: 'kola nuts', Name: 'Kola Nut', epithet: 'the Kola Hoarder', insult: 'kola-brained fool' },
    desc: 'Mansas, Negus, Sultans and Inkosi.',
    cultures: [['mande', 3], ['akan', 2.5], ['wolof', 2], ['yoruba', 2.5], ['igbo', 1.5], ['hausa', 2.5], ['edo', 1.2], ['kanuri', 1.2], ['fulani', 1.2], ['amhara', 2], ['swahili', 2], ['zulu', 2], ['berber', 2]],
    setting: 'pre-colonial Africa (lighthearted and affectionate, never stereotyped)',
  },
  asia: {
    label: 'Asia', icon: '🏯', climate: 'mixed',
    food: { name: 'tea', Name: 'Tea', epithet: 'the Tea-Mad', insult: 'leaf-brained fool' },
    desc: 'Shoguns, Khans, Rajas and Shahs.',
    cultures: [['han', 4], ['japanese', 2.5], ['korean', 2], ['mongol', 2.5], ['tibetan', 1], ['khmer', 1.5], ['viet', 1.5], ['malay', 1.5], ['hindustani', 3], ['tamil', 2], ['persian', 2.5]],
    setting: 'medieval Asia (lighthearted and affectionate, never stereotyped)',
  },
  eastasia: {
    label: 'East Asia', icon: '🐉', climate: 'temperate',
    food: { name: 'tea', Name: 'Tea', epithet: 'the Tea-Mad', insult: 'leaf-brained fool' },
    desc: 'Emperors, Daimyo, Kings and Khans.',
    cultures: [['han', 5], ['japanese', 3], ['korean', 2.5], ['mongol', 2], ['tibetan', 1]],
    setting: 'medieval East Asia (lighthearted and affectionate, never stereotyped)',
  },
  india: {
    label: 'The Subcontinent', icon: '🐘', climate: 'tropical',
    food: { name: 'mangoes', Name: 'Mango', epithet: 'the Mango-Mad', insult: 'pulp-brained fool' },
    desc: 'Rajput forts and Tamil temple kingdoms.',
    cultures: [['hindustani', 5], ['tamil', 3.5], ['persian', 1.5], ['tibetan', 0.8]],
    setting: 'medieval South Asia (lighthearted and affectionate, never stereotyped)',
  },
};

export const culture = id => CULTURES[id] || CULTURES['western-european'];
export const preset = id => PRESETS[id] || PRESETS.world;

export function personName(rng, cultureId, sex) {
  const c = culture(cultureId);
  return rng.pick(c[sex] || c.m);
}
export function houseNameFor(rng, cultureId) {
  const c = culture(cultureId);
  return c.houses === 'silly' || !c.houses ? sillyHouse(rng) : rng.pick(c.houses);
}
export function placeNameFor(rng, cultureId, used) {
  const c = culture(cultureId);
  if (c.places === 'silly' || !c.places) {
    let n; let k = 0; do { n = sillyPlace(rng); } while (used.has(n) && ++k < 40);
    return n;
  }
  const free = c.places.filter(p => !used.has(p));
  if (free.length) return rng.pick(free);
  for (const pre of ['Upper ', 'Lower ', 'New ', 'Old ', 'East ', 'West ']) {
    const f = c.places.map(p => pre + p).filter(p => !used.has(p));
    if (f.length) return rng.pick(f);
  }
  return sillyPlace(rng);
}

export function sizeClass(provinces) { return provinces >= 9 ? 'large' : provinces >= 5 ? 'mid' : 'small'; }
export function realmKindFor(cultureId, provinces, silly, rng) {
  const c = culture(cultureId);
  const sz = sizeClass(provinces);
  if (silly && rng && c.kinds === EURO_KINDS) {
    if (sz === 'large') return rng.pick(['Kingdom', 'Kingdom', 'Empire']);
    if (sz === 'mid') return rng.weighted([['Kingdom', 2], ['Duchy', 4], ['Grand Duchy', 1]]);
    return rng.weighted([['Duchy', 3], ['County', 2], ['Principality', 1]]);
  }
  return (c.kinds || EURO_KINDS)[sz];
}

const KIND_TITLES = {
  Kingdom: ['King', 'Queen'], Empire: ['Emperor', 'Empress'], Duchy: ['Duke', 'Duchess'], 'Grand Duchy': ['Grand Duke', 'Grand Duchess'],
  County: ['Count', 'Countess'], Principality: ['Prince', 'Princess'], Emirate: ['Emir', 'Emira'], Khanate: ['Khan', 'Khatun'],
};
/** Ruler title from the realm's culture and size; old saves (no culture titles) fall back to the realm kind. */
export function titleFor(realm, provinces, sex) {
  const c = CULTURES[realm.heritage];
  const i = sex === 'm' ? 0 : 1;
  if (c && c.titles && c.kinds !== EURO_KINDS) {
    // the kind was picked from the culture table: find its size class
    const sz = Object.keys(c.kinds || {}).find(k => c.kinds[k] === realm.kind) || sizeClass(provinces);
    return c.titles[sz][i];
  }
  return (KIND_TITLES[realm.kind] || ['Lord', 'Lady'])[i];
}

export function roleTitle(cultureId, role) {
  const c = CULTURES[cultureId];
  return c && c.roles && c.roles[role] || null;
}
