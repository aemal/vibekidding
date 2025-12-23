"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, X } from "lucide-react";

interface EmojiPickerProps {
  selectedEmoji: string;
  onSelect: (emoji: string) => void;
}

// Emoji search keywords for better searchability
const EMOJI_KEYWORDS: Record<string, string[]> = {
  // Games & Sports
  "🎮": ["game", "controller", "video game", "play", "gaming"],
  "🕹️": ["joystick", "game", "arcade", "play"],
  "🎲": ["dice", "game", "luck", "roll", "casino"],
  "🎯": ["target", "bullseye", "aim", "dart"],
  "🏆": ["trophy", "winner", "champion", "prize", "gold"],
  "🥇": ["gold", "medal", "first", "winner", "1st"],
  "🥈": ["silver", "medal", "second", "2nd"],
  "🥉": ["bronze", "medal", "third", "3rd"],
  "⚽": ["soccer", "football", "ball", "sport"],
  "🏀": ["basketball", "ball", "sport", "nba"],
  "🏈": ["football", "american", "nfl", "sport"],
  "⚾": ["baseball", "ball", "sport"],
  "🎾": ["tennis", "ball", "sport", "racket"],
  "🏐": ["volleyball", "ball", "sport"],
  "🎱": ["pool", "billiards", "8ball", "game"],
  "🎳": ["bowling", "pins", "ball", "sport"],
  "🎪": ["circus", "tent", "carnival", "fun"],
  
  // Animals
  "🐶": ["dog", "puppy", "pet", "animal", "cute", "woof"],
  "🐱": ["cat", "kitty", "pet", "animal", "cute", "meow"],
  "🐭": ["mouse", "rat", "animal", "cheese"],
  "🐹": ["hamster", "pet", "animal", "cute"],
  "🐰": ["rabbit", "bunny", "animal", "cute", "easter"],
  "🦊": ["fox", "animal", "orange", "clever"],
  "🐻": ["bear", "animal", "teddy", "brown"],
  "🐼": ["panda", "bear", "animal", "cute", "bamboo"],
  "🐨": ["koala", "animal", "australia", "cute"],
  "🐯": ["tiger", "animal", "stripes", "cat"],
  "🦁": ["lion", "animal", "king", "cat", "roar"],
  "🐮": ["cow", "animal", "farm", "moo", "milk"],
  "🐷": ["pig", "animal", "farm", "oink", "pink"],
  "🐸": ["frog", "animal", "green", "ribbit"],
  "🐵": ["monkey", "animal", "banana", "ape"],
  "🐔": ["chicken", "bird", "farm", "hen"],
  "🐧": ["penguin", "bird", "animal", "ice", "cold"],
  "🐦": ["bird", "animal", "fly", "tweet"],
  "🦆": ["duck", "bird", "animal", "quack"],
  "🦅": ["eagle", "bird", "animal", "fly", "america"],
  "🦉": ["owl", "bird", "animal", "night", "wise"],
  "🦇": ["bat", "animal", "night", "vampire", "fly"],
  "🐴": ["horse", "animal", "ride", "pony"],
  "🦄": ["unicorn", "horse", "magic", "rainbow", "fantasy"],
  "🐝": ["bee", "insect", "honey", "buzz", "yellow"],
  "🦋": ["butterfly", "insect", "pretty", "fly"],
  "🐌": ["snail", "slow", "shell", "animal"],
  "🐞": ["ladybug", "insect", "red", "lucky"],
  "🐢": ["turtle", "animal", "slow", "shell", "green"],
  "🐍": ["snake", "animal", "reptile", "hiss"],
  "🦖": ["dinosaur", "trex", "animal", "extinct", "dino"],
  "🦕": ["dinosaur", "dino", "animal", "long neck"],
  "🐙": ["octopus", "ocean", "animal", "tentacles"],
  "🦈": ["shark", "fish", "ocean", "animal", "scary"],
  "🐬": ["dolphin", "ocean", "animal", "swim", "smart"],
  "🐳": ["whale", "ocean", "animal", "big", "water"],
  "🐊": ["crocodile", "alligator", "animal", "reptile"],
  "🐘": ["elephant", "animal", "big", "trunk", "grey"],
  "🦒": ["giraffe", "animal", "tall", "spots", "neck"],
  "🐉": ["dragon", "fantasy", "fire", "mythical"],
  "🐲": ["dragon", "chinese", "fantasy", "mythical"],
  
  // Nature & Weather
  "🌈": ["rainbow", "colors", "colorful", "sky", "weather"],
  "⭐": ["star", "night", "sky", "sparkle", "gold"],
  "🌟": ["star", "sparkle", "shine", "bright", "glowing"],
  "✨": ["sparkle", "magic", "shine", "glitter", "stars"],
  "💫": ["star", "dizzy", "sparkle", "magic"],
  "⚡": ["lightning", "electric", "power", "flash", "bolt"],
  "☄️": ["comet", "space", "star", "meteor"],
  "🔥": ["fire", "hot", "flame", "burn", "lit"],
  "🌪️": ["tornado", "wind", "storm", "weather"],
  "🌊": ["wave", "ocean", "water", "sea", "surf"],
  "💧": ["water", "drop", "rain", "blue"],
  "☔": ["rain", "umbrella", "weather", "wet"],
  "☀️": ["sun", "sunny", "weather", "hot", "bright"],
  "🌞": ["sun", "face", "happy", "sunny", "bright"],
  "🌙": ["moon", "night", "sleep", "crescent"],
  "🌕": ["moon", "full", "night", "round"],
  "❄️": ["snow", "cold", "winter", "ice", "frozen"],
  "☃️": ["snowman", "winter", "cold", "snow"],
  "⛄": ["snowman", "winter", "cold", "snow"],
  "🌸": ["flower", "cherry", "blossom", "pink", "spring"],
  "🌹": ["rose", "flower", "red", "love", "romantic"],
  "🌺": ["flower", "hibiscus", "tropical", "pretty"],
  "🌻": ["sunflower", "flower", "yellow", "sun"],
  "🌼": ["flower", "blossom", "yellow", "daisy"],
  "🌷": ["tulip", "flower", "spring", "pink"],
  "🌲": ["tree", "evergreen", "pine", "christmas", "forest"],
  "🌳": ["tree", "green", "nature", "forest"],
  "🌴": ["palm", "tree", "tropical", "beach", "island"],
  "🍀": ["clover", "lucky", "four leaf", "green", "irish"],
  "🍁": ["leaf", "maple", "fall", "autumn", "canada"],
  "🍄": ["mushroom", "fungus", "mario", "nature"],
  
  // Food & Drinks
  "🍕": ["pizza", "food", "cheese", "italian", "slice"],
  "🍔": ["burger", "hamburger", "food", "fast food"],
  "🍟": ["fries", "french fries", "food", "potato"],
  "🌭": ["hotdog", "food", "sausage"],
  "🍿": ["popcorn", "movie", "snack", "food"],
  "🍦": ["ice cream", "dessert", "cold", "sweet", "cone"],
  "🍩": ["donut", "doughnut", "dessert", "sweet", "food"],
  "🍪": ["cookie", "dessert", "sweet", "food", "chocolate"],
  "🎂": ["cake", "birthday", "dessert", "sweet", "party"],
  "🧁": ["cupcake", "dessert", "sweet", "food", "cake"],
  "🍭": ["lollipop", "candy", "sweet", "dessert"],
  "🍬": ["candy", "sweet", "dessert", "sugar"],
  "🍫": ["chocolate", "candy", "sweet", "dessert", "bar"],
  "🍎": ["apple", "fruit", "red", "food", "healthy"],
  "🍊": ["orange", "fruit", "food", "citrus"],
  "🍋": ["lemon", "fruit", "yellow", "sour", "citrus"],
  "🍌": ["banana", "fruit", "yellow", "food", "monkey"],
  "🍉": ["watermelon", "fruit", "summer", "red", "green"],
  "🍇": ["grapes", "fruit", "purple", "wine"],
  "🍓": ["strawberry", "fruit", "red", "sweet", "berry"],
  "🍒": ["cherry", "fruit", "red", "sweet"],
  "🍑": ["peach", "fruit", "pink", "fuzzy"],
  "🥑": ["avocado", "fruit", "green", "food", "guac"],
  "🥕": ["carrot", "vegetable", "orange", "food", "bunny"],
  "🌽": ["corn", "vegetable", "yellow", "food"],
  "🥦": ["broccoli", "vegetable", "green", "food", "healthy"],
  "🍳": ["egg", "breakfast", "food", "fried"],
  "🥞": ["pancakes", "breakfast", "food", "syrup"],
  "🧇": ["waffle", "breakfast", "food", "syrup"],
  "🥓": ["bacon", "breakfast", "food", "meat"],
  "🍣": ["sushi", "food", "japanese", "fish", "rice"],
  "🍜": ["noodles", "ramen", "food", "asian", "soup"],
  "🍝": ["spaghetti", "pasta", "food", "italian"],
  "🌮": ["taco", "food", "mexican"],
  "🌯": ["burrito", "food", "mexican", "wrap"],
  "☕": ["coffee", "drink", "hot", "morning", "cafe"],
  "🍵": ["tea", "drink", "hot", "cup", "green"],
  "🧃": ["juice", "drink", "box", "kids"],
  "🥤": ["drink", "soda", "cup", "straw"],
  "🍺": ["beer", "drink", "mug"],
  
  // Space & Science
  "🚀": ["rocket", "space", "launch", "fly", "nasa"],
  "🛸": ["ufo", "alien", "space", "flying saucer"],
  "👽": ["alien", "space", "extraterrestrial", "green"],
  "👾": ["alien", "space invader", "game", "monster"],
  "🤖": ["robot", "machine", "android", "tech"],
  "🛰️": ["satellite", "space", "orbit"],
  "🌍": ["earth", "world", "planet", "globe"],
  "🌎": ["earth", "world", "planet", "globe", "america"],
  "🌏": ["earth", "world", "planet", "globe", "asia"],
  "🪐": ["planet", "saturn", "space", "rings"],
  "🔭": ["telescope", "space", "stars", "look"],
  "🔬": ["microscope", "science", "lab"],
  "🧪": ["test tube", "science", "lab", "chemistry"],
  "🧬": ["dna", "science", "genetics", "biology"],
  "💡": ["light bulb", "idea", "bright", "electric"],
  
  // Art & Music
  "🎨": ["art", "paint", "palette", "colors", "artist"],
  "🖼️": ["picture", "frame", "art", "painting"],
  "🎭": ["theater", "masks", "drama", "acting"],
  "🎬": ["movie", "film", "cinema", "action", "camera"],
  "🎤": ["microphone", "sing", "music", "karaoke"],
  "🎧": ["headphones", "music", "listen", "audio"],
  "🎵": ["music", "note", "song", "melody"],
  "🎶": ["music", "notes", "song", "melody"],
  "🎹": ["piano", "music", "keyboard", "instrument"],
  "🥁": ["drum", "music", "beat", "instrument"],
  "🎷": ["saxophone", "music", "jazz", "instrument"],
  "🎺": ["trumpet", "music", "brass", "instrument"],
  "🎸": ["guitar", "music", "rock", "instrument"],
  "🎻": ["violin", "music", "classical", "instrument"],
  "📷": ["camera", "photo", "picture", "snap"],
  "📸": ["camera", "flash", "photo", "selfie"],
  "📹": ["video", "camera", "record", "film"],
  "✏️": ["pencil", "write", "draw", "school"],
  "🖌️": ["paintbrush", "art", "paint", "draw"],
  "🖍️": ["crayon", "color", "draw", "art"],
  
  // Faces & Emotions
  "😀": ["smile", "happy", "face", "grin"],
  "😃": ["smile", "happy", "face", "grin", "big"],
  "😄": ["smile", "happy", "face", "laugh"],
  "😁": ["smile", "happy", "face", "teeth", "grin"],
  "😊": ["smile", "happy", "face", "blush", "cute"],
  "😇": ["angel", "innocent", "halo", "good"],
  "🥰": ["love", "hearts", "happy", "cute", "adore"],
  "😍": ["love", "heart eyes", "happy", "crush"],
  "🤩": ["star", "eyes", "excited", "amazing", "wow"],
  "😘": ["kiss", "love", "heart", "cute"],
  "😋": ["yummy", "delicious", "tasty", "tongue"],
  "😜": ["wink", "tongue", "silly", "playful", "crazy"],
  "🤪": ["crazy", "silly", "wild", "goofy"],
  "😎": ["cool", "sunglasses", "awesome", "chill"],
  "🤓": ["nerd", "glasses", "smart", "geek"],
  "🥳": ["party", "celebrate", "birthday", "happy"],
  "😴": ["sleep", "tired", "zzz", "snore"],
  "🤤": ["drool", "hungry", "yummy", "delicious"],
  "😷": ["sick", "mask", "ill", "covid"],
  "🤒": ["sick", "thermometer", "fever", "ill"],
  "🤕": ["hurt", "bandage", "injured", "sick"],
  "🤢": ["sick", "nauseous", "green", "ill"],
  "🤮": ["sick", "vomit", "throw up", "ill"],
  "🥵": ["hot", "sweating", "heat", "warm"],
  "🥶": ["cold", "freezing", "ice", "frozen"],
  "😱": ["scared", "scream", "shock", "horror"],
  "😭": ["cry", "sad", "tears", "bawling"],
  "😤": ["angry", "mad", "huff", "frustrated"],
  "😡": ["angry", "mad", "rage", "furious"],
  "😈": ["devil", "evil", "mischief", "purple"],
  "👿": ["devil", "angry", "evil", "imp"],
  "💀": ["skull", "dead", "skeleton", "death"],
  "☠️": ["skull", "death", "danger", "pirate"],
  "💩": ["poop", "poo", "funny", "silly"],
  "🤡": ["clown", "circus", "funny", "scary"],
  "👹": ["ogre", "monster", "scary", "japanese"],
  "👺": ["goblin", "monster", "scary", "japanese"],
  "👻": ["ghost", "boo", "spooky", "halloween"],
  "🎃": ["pumpkin", "halloween", "jack o lantern", "scary"],
  "😺": ["cat", "smile", "happy", "face"],
  "😸": ["cat", "grin", "happy", "face"],
  "😻": ["cat", "love", "heart eyes", "face"],
  
  // Hearts & Love
  "❤️": ["heart", "love", "red", "valentine"],
  "🧡": ["heart", "love", "orange"],
  "💛": ["heart", "love", "yellow"],
  "💚": ["heart", "love", "green"],
  "💙": ["heart", "love", "blue"],
  "💜": ["heart", "love", "purple"],
  "🖤": ["heart", "love", "black"],
  "🤍": ["heart", "love", "white"],
  "🤎": ["heart", "love", "brown"],
  "💔": ["heart", "broken", "sad", "love"],
  "💕": ["hearts", "love", "two", "pink"],
  "💖": ["heart", "sparkle", "love", "pink"],
  "💗": ["heart", "growing", "love", "pink"],
  "💘": ["heart", "arrow", "cupid", "love"],
  "💝": ["heart", "gift", "ribbon", "love"],
  "💋": ["kiss", "lips", "love", "red"],
  "💌": ["love letter", "envelope", "heart", "mail"],
  "💍": ["ring", "diamond", "wedding", "engaged"],
  
  // People & Fantasy
  "👶": ["baby", "child", "infant", "cute"],
  "🧒": ["child", "kid", "young"],
  "👦": ["boy", "child", "kid", "young"],
  "👧": ["girl", "child", "kid", "young"],
  "👨": ["man", "adult", "male", "guy"],
  "👩": ["woman", "adult", "female", "girl"],
  "👴": ["old man", "grandpa", "elderly", "senior"],
  "👵": ["old woman", "grandma", "elderly", "senior"],
  "👮": ["police", "cop", "officer", "law"],
  "🕵️": ["detective", "spy", "investigate"],
  "💂": ["guard", "soldier", "british", "royal"],
  "🥷": ["ninja", "stealth", "warrior", "japanese"],
  "👷": ["construction", "worker", "builder", "hard hat"],
  "🤴": ["prince", "royal", "crown", "king"],
  "👸": ["princess", "royal", "crown", "queen"],
  "👼": ["angel", "baby", "wings", "heaven"],
  "🎅": ["santa", "christmas", "claus", "holiday"],
  "🤶": ["mrs claus", "christmas", "santa", "holiday"],
  "🦸": ["superhero", "hero", "cape", "power"],
  "🦹": ["supervillain", "villain", "cape", "evil"],
  "🧙": ["wizard", "magic", "merlin", "fantasy"],
  "🧚": ["fairy", "magic", "wings", "fantasy", "tinkerbell"],
  "🧛": ["vampire", "dracula", "halloween", "blood"],
  "🧜": ["mermaid", "merman", "ocean", "fish", "ariel"],
  "🧝": ["elf", "fantasy", "ears", "christmas"],
  "🧞": ["genie", "magic", "lamp", "wish"],
  "🧟": ["zombie", "undead", "halloween", "brain"],
  "💃": ["dance", "woman", "salsa", "party"],
  "🕺": ["dance", "man", "disco", "party"],
  
  // Hands & Gestures
  "👋": ["wave", "hello", "hi", "bye", "hand"],
  "🤚": ["hand", "stop", "raised", "palm"],
  "✋": ["hand", "stop", "high five", "palm"],
  "🖐️": ["hand", "fingers", "five", "palm"],
  "👌": ["ok", "perfect", "hand", "fine"],
  "✌️": ["peace", "victory", "two", "fingers"],
  "🤞": ["fingers crossed", "luck", "hope"],
  "🤟": ["love you", "sign", "hand", "rock"],
  "🤘": ["rock", "metal", "horns", "hand"],
  "🤙": ["call me", "hang loose", "shaka", "hand"],
  "👈": ["point", "left", "direction", "finger"],
  "👉": ["point", "right", "direction", "finger"],
  "👆": ["point", "up", "direction", "finger"],
  "👇": ["point", "down", "direction", "finger"],
  "👍": ["thumbs up", "good", "like", "approve", "yes"],
  "👎": ["thumbs down", "bad", "dislike", "no"],
  "✊": ["fist", "power", "punch", "strong"],
  "👊": ["fist bump", "punch", "power"],
  "👏": ["clap", "applause", "hands", "bravo"],
  "🙌": ["hands", "raised", "celebrate", "praise"],
  "🤝": ["handshake", "deal", "agreement", "hello"],
  "🙏": ["pray", "please", "thank you", "hands", "hope"],
  "💪": ["muscle", "strong", "flex", "arm", "power"],
  "👀": ["eyes", "look", "see", "watch"],
  "👁️": ["eye", "look", "see", "watch"],
  "👅": ["tongue", "lick", "taste"],
  "👄": ["lips", "mouth", "kiss"],
  
  // Places & Transport
  "🏠": ["house", "home", "building"],
  "🏡": ["house", "home", "garden", "yard"],
  "🏢": ["building", "office", "work"],
  "🏫": ["school", "building", "education"],
  "🏥": ["hospital", "building", "medical", "health"],
  "🏰": ["castle", "princess", "medieval", "kingdom"],
  "🏯": ["castle", "japanese", "palace"],
  "🗼": ["tower", "tokyo", "eiffel"],
  "🗽": ["statue of liberty", "new york", "america", "usa"],
  "⛪": ["church", "building", "religion"],
  "🕌": ["mosque", "building", "religion", "islam"],
  "🎢": ["roller coaster", "amusement", "fun", "ride"],
  "🎡": ["ferris wheel", "amusement", "fun", "ride"],
  "🎠": ["carousel", "horse", "amusement", "ride"],
  "🚂": ["train", "locomotive", "steam", "transport"],
  "🚃": ["train", "car", "railway", "transport"],
  "🚄": ["train", "bullet", "fast", "japan"],
  "🚅": ["train", "bullet", "fast", "japan"],
  "🚌": ["bus", "transport", "school", "public"],
  "🚎": ["bus", "trolley", "electric", "transport"],
  "🚑": ["ambulance", "emergency", "hospital", "medical"],
  "🚒": ["fire truck", "emergency", "firefighter"],
  "🚓": ["police car", "cop", "emergency", "law"],
  "🚕": ["taxi", "cab", "car", "yellow"],
  "🚗": ["car", "automobile", "vehicle", "drive"],
  "🚙": ["car", "suv", "vehicle", "drive"],
  "🏎️": ["race car", "fast", "formula", "racing"],
  "🏍️": ["motorcycle", "bike", "ride", "fast"],
  "🚲": ["bicycle", "bike", "ride", "cycle"],
  "🛴": ["scooter", "kick", "ride"],
  "🛹": ["skateboard", "skate", "ride", "trick"],
  "✈️": ["airplane", "plane", "fly", "travel", "airport"],
  "🛩️": ["airplane", "small plane", "fly"],
  "🚁": ["helicopter", "fly", "chopper"],
  "🚢": ["ship", "boat", "cruise", "ocean"],
  "⛵": ["sailboat", "boat", "ocean", "wind"],
  "🚤": ["speedboat", "boat", "fast", "water"],
  
  // Objects & Things
  "📱": ["phone", "mobile", "cell", "smartphone", "iphone"],
  "💻": ["laptop", "computer", "mac", "work"],
  "🖥️": ["computer", "desktop", "monitor", "screen"],
  "⌨️": ["keyboard", "type", "computer"],
  "🖱️": ["mouse", "computer", "click"],
  "💾": ["floppy", "disk", "save", "computer"],
  "💿": ["cd", "disc", "music", "dvd"],
  "📀": ["dvd", "disc", "movie"],
  "📺": ["tv", "television", "watch", "screen"],
  "📻": ["radio", "music", "listen"],
  "⏰": ["alarm", "clock", "time", "wake up"],
  "⌚": ["watch", "time", "clock", "wrist"],
  "🔋": ["battery", "power", "charge", "energy"],
  "🔌": ["plug", "electric", "power", "outlet"],
  "🔦": ["flashlight", "light", "torch", "dark"],
  "🕯️": ["candle", "light", "flame", "birthday"],
  "💰": ["money", "bag", "rich", "cash", "dollar"],
  "💵": ["money", "dollar", "cash", "bill"],
  "💳": ["credit card", "money", "pay", "bank"],
  "💎": ["diamond", "gem", "jewel", "precious", "sparkle"],
  "🔧": ["wrench", "tool", "fix", "repair"],
  "🔨": ["hammer", "tool", "build", "fix"],
  "⚙️": ["gear", "settings", "cog", "machine"],
  "🔩": ["bolt", "screw", "tool", "fix"],
  "🔫": ["gun", "water gun", "toy", "squirt"],
  "💣": ["bomb", "explosion", "boom"],
  "🔪": ["knife", "cut", "kitchen", "chef"],
  "🗡️": ["sword", "weapon", "knight", "fight"],
  "⚔️": ["swords", "crossed", "battle", "fight"],
  "🛡️": ["shield", "protect", "defend", "knight"],
  "🚬": ["cigarette", "smoking", "smoke"],
  "🔮": ["crystal ball", "magic", "fortune", "predict"],
  "📿": ["beads", "prayer", "rosary"],
  "💈": ["barber", "pole", "haircut"],
  "🧹": ["broom", "sweep", "clean", "witch"],
  "🧺": ["basket", "laundry", "picnic"],
  "🧻": ["toilet paper", "tissue", "roll"],
  "🚽": ["toilet", "bathroom", "restroom"],
  "🚿": ["shower", "bathroom", "water", "clean"],
  "🛁": ["bathtub", "bath", "water", "clean"],
  "🧼": ["soap", "clean", "wash", "bubble"],
  "🧸": ["teddy bear", "toy", "stuffed", "cute"],
  "🎁": ["gift", "present", "birthday", "christmas", "box"],
  "🎈": ["balloon", "party", "birthday", "celebrate"],
  "🎀": ["ribbon", "bow", "gift", "pink"],
  "🎊": ["confetti", "party", "celebrate"],
  "🎉": ["party", "celebrate", "popper", "birthday"],
  "🎏": ["carp", "koi", "japanese", "flag"],
  "🎐": ["wind chime", "japanese", "bell"],
  "✉️": ["envelope", "mail", "letter", "email"],
  "📩": ["envelope", "mail", "incoming"],
  "📨": ["envelope", "mail", "outgoing"],
  "📧": ["email", "mail", "letter", "at"],
  "📦": ["package", "box", "delivery", "shipping"],
  "📚": ["books", "read", "study", "library"],
  "📖": ["book", "read", "open", "study"],
  "📓": ["notebook", "write", "journal"],
  "📔": ["notebook", "write", "journal", "decorated"],
  "📕": ["book", "red", "closed", "read"],
  "📗": ["book", "green", "closed", "read"],
  "📘": ["book", "blue", "closed", "read"],
  "📙": ["book", "orange", "closed", "read"],
  "🔖": ["bookmark", "read", "tag"],
  "🔗": ["link", "chain", "connect"],
  "📎": ["paperclip", "attach", "clip"],
  "✂️": ["scissors", "cut", "craft"],
  "📐": ["triangle ruler", "math", "geometry"],
  "📏": ["ruler", "measure", "straight"],
  "🔍": ["magnifying glass", "search", "look", "zoom"],
  "🔎": ["magnifying glass", "search", "look", "zoom"],
  "🔒": ["lock", "locked", "secure", "private"],
  "🔓": ["unlock", "open", "unlocked"],
  "🔑": ["key", "lock", "unlock", "password"],
  "🗝️": ["key", "old", "vintage", "antique"],
  "🚪": ["door", "entrance", "exit"],
  "🪑": ["chair", "sit", "furniture", "seat"],
  "🛋️": ["couch", "sofa", "furniture", "sit"],
  "🛏️": ["bed", "sleep", "furniture", "bedroom"],
  "👑": ["crown", "king", "queen", "royal", "princess"],
  "👒": ["hat", "woman", "sun", "fashion"],
  "🎩": ["top hat", "magic", "fancy", "gentleman"],
  "🎓": ["graduation", "cap", "school", "college"],
  "🧢": ["cap", "baseball", "hat", "sport"],
  "👓": ["glasses", "eyes", "see", "read"],
  "🕶️": ["sunglasses", "cool", "sun", "eyes"],
  "💄": ["lipstick", "makeup", "red", "beauty"],
};

// Hundreds of kid-friendly emojis organized by category
const EMOJI_CATEGORIES = {
  "🎮 Games & Sports": [
    "🎮", "🕹️", "🎲", "🎯", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️",
    "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱",
    "🪀", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🪃", "🥅", "⛳",
    "🪁", "🎣", "🤿", "🎿", "🛷", "🥌", "🎳", "🎪", "🤹", "🎰",
  ],
  "🐾 Animals": [
    "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨",
    "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒",
    "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇",
    "🐺", "🐗", "🐴", "🦄", "🐝", "🪱", "🐛", "🦋", "🐌", "🐞",
    "🐜", "🪰", "🪲", "🪳", "🦟", "🦗", "🕷️", "🦂", "🐢", "🐍",
    "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠",
    "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍",
    "🦧", "🦣", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘", "🦬",
    "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🦙", "🐐", "🦌",
    "🐕", "🐩", "🦮", "🐕‍🦺", "🐈", "🐈‍⬛", "🪶", "🐓", "🦃", "🦤",
    "🦚", "🦜", "🦢", "🦩", "🕊️", "🐇", "🦝", "🦨", "🦡", "🦫",
    "🦦", "🦥", "🐁", "🐀", "🐿️", "🦔", "🐉", "🐲",
  ],
  "🌈 Nature & Weather": [
    "🌈", "⭐", "🌟", "✨", "💫", "⚡", "☄️", "🔥", "🌪️", "🌊",
    "💧", "💦", "☔", "⛈️", "🌧️", "🌦️", "🌥️", "⛅", "🌤️", "☀️",
    "🌞", "🌝", "🌛", "🌜", "🌚", "🌙", "🌕", "🌖", "🌗", "🌘",
    "🌑", "🌒", "🌓", "🌔", "🌎", "🌍", "🌏", "🪐", "💥", "🌠",
    "🌌", "☁️", "🌫️", "🌀", "🌡️", "❄️", "🌬️", "💨", "☃️", "⛄",
    "🌸", "💮", "🏵️", "🌹", "🥀", "🌺", "🌻", "🌼", "🌷", "🌱",
    "🪴", "🌲", "🌳", "🌴", "🌵", "🌾", "🌿", "☘️", "🍀", "🍁",
    "🍂", "🍃", "🍄", "🪨", "🪵", "🌰", "🦠",
  ],
  "🍕 Food & Drinks": [
    "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐",
    "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑",
    "🥦", "🥬", "🥒", "🌶️", "🫑", "🌽", "🥕", "🫒", "🧄", "🧅",
    "🥔", "🍠", "🥐", "🥯", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳",
    "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔",
    "🍟", "🍕", "🫓", "🥪", "🥙", "🧆", "🌮", "🌯", "🫔", "🥗",
    "🥘", "🫕", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪",
    "🍤", "🍙", "🍚", "🍘", "🍥", "🥠", "🥮", "🍢", "🍡", "🍧",
    "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫",
    "🍿", "🍩", "🍪", "🌰", "🥜", "🍯", "🥛", "🍼", "🫖", "☕",
    "🍵", "🧃", "🥤", "🧋", "🍶", "🍺", "🍻", "🥂", "🍷", "🥃",
    "🍸", "🍹", "🧉", "🍾", "🧊", "🥄", "🍴", "🍽️", "🥣", "🥡",
  ],
  "🚀 Space & Science": [
    "🚀", "🛸", "👽", "👾", "🤖", "🛰️", "🌍", "🌎", "🌏", "🪐",
    "⭐", "🌟", "💫", "✨", "☄️", "🌠", "🌌", "🔭", "🔬", "🧪",
    "🧫", "🧬", "💉", "💊", "🩺", "🩹", "🩼", "🦠", "⚗️", "🔋",
    "🔌", "💡", "🔦", "🕯️", "🧯", "🛢️", "💸", "💵", "💴", "💶",
  ],
  "🎨 Art & Music": [
    "🎨", "🖼️", "🎭", "🎪", "🎬", "🎤", "🎧", "🎼", "🎵", "🎶",
    "🎹", "🥁", "🪘", "🎷", "🎺", "🪗", "🎸", "🪕", "🎻", "🪈",
    "📯", "🎙️", "📻", "📺", "📷", "📸", "📹", "🎥", "📽️", "🎞️",
    "✏️", "✒️", "🖊️", "🖋️", "🖌️", "🖍️", "📝", "📒", "📕", "📗",
    "📘", "📙", "📚", "📖", "🔖", "🏷️", "💝", "📜", "📃", "📄",
  ],
  "😊 Faces & Emotions": [
    "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
    "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "☺️", "😚",
    "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔",
    "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥",
    "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮",
    "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎",
    "🤓", "🧐", "😕", "😟", "🙁", "☹️", "😮", "😯", "😲", "😳",
    "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖",
    "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬",
    "😈", "👿", "💀", "☠️", "💩", "🤡", "👹", "👺", "👻", "👽",
    "👾", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀",
    "😿", "😾",
  ],
  "💖 Hearts & Love": [
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
    "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "❤️‍🔥",
    "❤️‍🩹", "♥️", "🫀", "💋", "💌", "💐", "🌹", "🥀", "💒", "💍",
  ],
  "🦸 People & Fantasy": [
    "👶", "🧒", "👦", "👧", "🧑", "👱", "👨", "🧔", "👩", "🧓",
    "👴", "👵", "🙍", "🙎", "🙅", "🙆", "💁", "🙋", "🧏", "🙇",
    "🤦", "🤷", "👮", "🕵️", "💂", "🥷", "👷", "🤴", "👸", "👳",
    "👲", "🧕", "🤵", "👰", "🤰", "🤱", "👼", "🎅", "🤶", "🦸",
    "🦹", "🧙", "🧚", "🧛", "🧜", "🧝", "🧞", "🧟", "💆", "💇",
    "🚶", "🧍", "🧎", "🏃", "💃", "🕺", "🕴️", "👯", "🧖", "🧗",
    "🤸", "🏌️", "🏇", "⛷️", "🏂", "🏋️", "🤼", "🤽", "🤾", "🤺",
    "⛹️", "🏊", "🚣", "🧘", "🛀", "🛌", "👭", "👫", "👬", "💏",
    "💑", "👪", "👨‍👩‍👦", "👨‍👩‍👧", "👨‍👩‍👧‍👦", "👨‍👩‍👦‍👦", "👨‍👩‍👧‍👧",
  ],
  "✋ Hands & Gestures": [
    "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞",
    "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍",
    "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝",
    "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶", "👂",
    "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅",
    "👄", "💋",
  ],
  "🏠 Places & Transport": [
    "🏠", "🏡", "🏢", "🏣", "🏤", "🏥", "🏦", "🏨", "🏩", "🏪",
    "🏫", "🏬", "🏭", "🏯", "🏰", "💒", "🗼", "🗽", "⛪", "🕌",
    "🛕", "🕍", "⛩️", "🕋", "⛲", "⛺", "🌁", "🌃", "🏙️", "🌄",
    "🌅", "🌆", "🌇", "🌉", "🎠", "🎡", "🎢", "🚂", "🚃", "🚄",
    "🚅", "🚆", "🚇", "🚈", "🚉", "🚊", "🚝", "🚞", "🚋", "🚌",
    "🚍", "🚎", "🚐", "🚑", "🚒", "🚓", "🚔", "🚕", "🚖", "🚗",
    "🚘", "🚙", "🛻", "🚚", "🚛", "🚜", "🏎️", "🏍️", "🛵", "🦽",
    "🦼", "🛺", "🚲", "🛴", "🛹", "🛼", "🚏", "🛣️", "🛤️", "⛽",
    "🚨", "🚥", "🚦", "🚧", "⚓", "⛵", "🛶", "🚤", "🛳️", "⛴️",
    "🛥️", "🚢", "✈️", "🛩️", "🛫", "🛬", "🪂", "💺", "🚁", "🚟",
    "🚠", "🚡", "🛰️", "🚀", "🛸",
  ],
  "🎁 Objects & Things": [
    "⌚", "📱", "📲", "💻", "⌨️", "🖥️", "🖨️", "🖱️", "🖲️", "🕹️",
    "🗜️", "💽", "💾", "💿", "📀", "📼", "📷", "📸", "📹", "🎥",
    "📽️", "🎞️", "📞", "☎️", "📟", "📠", "📺", "📻", "🎙️", "🎚️",
    "🎛️", "🧭", "⏱️", "⏲️", "⏰", "🕰️", "⌛", "⏳", "📡", "🔋",
    "🔌", "💡", "🔦", "🕯️", "🪔", "🧯", "🛢️", "💸", "💵", "💴",
    "💶", "💷", "🪙", "💰", "💳", "💎", "⚖️", "🪜", "🧰", "🪛",
    "🔧", "🔨", "⚒️", "🛠️", "⛏️", "🪚", "🔩", "⚙️", "🪤", "🧱",
    "⛓️", "🧲", "🔫", "💣", "🧨", "🪓", "🔪", "🗡️", "⚔️", "🛡️",
    "🚬", "⚰️", "🪦", "⚱️", "🏺", "🔮", "📿", "🧿", "💈", "⚗️",
    "🔭", "🔬", "🕳️", "🩹", "🩺", "💊", "💉", "🩸", "🧬", "🦠",
    "🧫", "🧪", "🌡️", "🧹", "🪠", "🧺", "🧻", "🚽", "🚰", "🚿",
    "🛁", "🛀", "🧼", "🪥", "🪒", "🧽", "🪣", "🧴", "🛎️", "🔑",
    "🗝️", "🚪", "🪑", "🛋️", "🛏️", "🛌", "🧸", "🪆", "🖼️", "🪞",
    "🪟", "🛍️", "🛒", "🎁", "🎈", "🎏", "🎀", "🪄", "🎊", "🎉",
    "🎎", "🏮", "🎐", "🧧", "✉️", "📩", "📨", "📧", "💌", "📥",
    "📤", "📦", "🏷️", "📪", "📫", "📬", "📭", "📮", "📯", "📜",
    "📃", "📄", "📑", "🧾", "📊", "📈", "📉", "🗒️", "🗓️", "📆",
    "📅", "🗑️", "📇", "🗃️", "🗳️", "🗄️", "📋", "📁", "📂", "🗂️",
    "🗞️", "📰", "📓", "📔", "📒", "📕", "📗", "📘", "📙", "📚",
    "📖", "🔖", "🧷", "🔗", "📎", "🖇️", "📐", "📏", "🧮", "📌",
    "📍", "✂️", "🖊️", "🖋️", "✒️", "🖌️", "🖍️", "📝", "✏️", "🔍",
    "🔎", "🔏", "🔐", "🔒", "🔓", "👑", "👒", "🎩", "🎓", "🧢",
    "🪖", "⛑️", "📿", "💄", "💍", "💎",
  ],
  "🔣 Symbols": [
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
    "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮️",
    "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "🕎", "☯️", "☦️", "🛐",
    "⛎", "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐",
    "♑", "♒", "♓", "🆔", "⚛️", "🉑", "☢️", "☣️", "📴", "📳",
    "🈶", "🈚", "🈸", "🈺", "🈷️", "✴️", "🆚", "💮", "🉐", "㊙️",
    "㊗️", "🈴", "🈵", "🈹", "🈲", "🅰️", "🅱️", "🆎", "🆑", "🅾️",
    "🆘", "❌", "⭕", "🛑", "⛔", "📛", "🚫", "💯", "💢", "♨️",
    "🚷", "🚯", "🚳", "🚱", "🔞", "📵", "🚭", "❗", "❕", "❓",
    "❔", "‼️", "⁉️", "🔅", "🔆", "〽️", "⚠️", "🚸", "🔱", "⚜️",
    "🔰", "♻️", "✅", "🈯", "💹", "❇️", "✳️", "❎", "🌐", "💠",
    "Ⓜ️", "🌀", "💤", "🏧", "🚾", "♿", "🅿️", "🛗", "🈳", "🈂️",
    "🛂", "🛃", "🛄", "🛅", "🚹", "🚺", "🚼", "⚧️", "🚻", "🚮",
    "🎦", "📶", "🈁", "🔣", "ℹ️", "🔤", "🔡", "🔠", "🆖", "🆗",
    "🆙", "🆒", "🆕", "🆓", "0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣",
    "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟", "🔢", "#️⃣", "*️⃣", "⏏️", "▶️",
    "⏸️", "⏯️", "⏹️", "⏺️", "⏭️", "⏮️", "⏩", "⏪", "⏫", "⏬",
    "◀️", "🔼", "🔽", "➡️", "⬅️", "⬆️", "⬇️", "↗️", "↘️", "↙️",
    "↖️", "↕️", "↔️", "↪️", "↩️", "⤴️", "⤵️", "🔀", "🔁", "🔂",
    "🔄", "🔃", "🎵", "🎶", "➕", "➖", "➗", "✖️", "♾️", "💲",
    "💱", "™️", "©️", "®️", "👁️‍🗨️", "🔚", "🔙", "🔛", "🔝", "🔜",
    "〰️", "➰", "➿", "✔️", "☑️", "🔘", "🔴", "🟠", "🟡", "🟢",
    "🔵", "🟣", "⚫", "⚪", "🟤", "🔺", "🔻", "🔸", "🔹", "🔶",
    "🔷", "🔳", "🔲", "▪️", "▫️", "◾", "◽", "◼️", "◻️", "🟥",
    "🟧", "🟨", "🟩", "🟦", "🟪", "⬛", "⬜", "🟫", "🔈", "🔇",
    "🔉", "🔊", "🔔", "🔕", "📣", "📢",
  ],
  "🏁 Flags": [
    "🏁", "🚩", "🎌", "🏴", "🏳️", "🏳️‍🌈", "🏳️‍⚧️", "🏴‍☠️", "🇦🇨", "🇦🇩",
    "🇦🇪", "🇦🇫", "🇦🇬", "🇦🇮", "🇦🇱", "🇦🇲", "🇦🇴", "🇦🇶", "🇦🇷", "🇦🇸",
    "🇦🇹", "🇦🇺", "🇦🇼", "🇦🇽", "🇦🇿", "🇧🇦", "🇧🇧", "🇧🇩", "🇧🇪", "🇧🇫",
    "🇧🇬", "🇧🇭", "🇧🇮", "🇧🇯", "🇧🇱", "🇧🇲", "🇧🇳", "🇧🇴", "🇧🇶", "🇧🇷",
    "🇧🇸", "🇧🇹", "🇧🇻", "🇧🇼", "🇧🇾", "🇧🇿", "🇨🇦", "🇨🇨", "🇨🇩", "🇨🇫",
    "🇨🇬", "🇨🇭", "🇨🇮", "🇨🇰", "🇨🇱", "🇨🇲", "🇨🇳", "🇨🇴", "🇨🇵", "🇨🇷",
    "🇨🇺", "🇨🇻", "🇨🇼", "🇨🇽", "🇨🇾", "🇨🇿", "🇩🇪", "🇩🇬", "🇩🇯", "🇩🇰",
    "🇩🇲", "🇩🇴", "🇩🇿", "🇪🇦", "🇪🇨", "🇪🇪", "🇪🇬", "🇪🇭", "🇪🇷", "🇪🇸",
    "🇪🇹", "🇪🇺", "🇫🇮", "🇫🇯", "🇫🇰", "🇫🇲", "🇫🇴", "🇫🇷", "🇬🇦", "🇬🇧",
    "🇬🇩", "🇬🇪", "🇬🇫", "🇬🇬", "🇬🇭", "🇬🇮", "🇬🇱", "🇬🇲", "🇬🇳", "🇬🇵",
    "🇬🇶", "🇬🇷", "🇬🇸", "🇬🇹", "🇬🇺", "🇬🇼", "🇬🇾", "🇭🇰", "🇭🇲", "🇭🇳",
    "🇭🇷", "🇭🇹", "🇭🇺", "🇮🇨", "🇮🇩", "🇮🇪", "🇮🇱", "🇮🇲", "🇮🇳", "🇮🇴",
    "🇮🇶", "🇮🇷", "🇮🇸", "🇮🇹", "🇯🇪", "🇯🇲", "🇯🇴", "🇯🇵", "🇰🇪", "🇰🇬",
    "🇰🇭", "🇰🇮", "🇰🇲", "🇰🇳", "🇰🇵", "🇰🇷", "🇰🇼", "🇰🇾", "🇰🇿", "🇱🇦",
    "🇱🇧", "🇱🇨", "🇱🇮", "🇱🇰", "🇱🇷", "🇱🇸", "🇱🇹", "🇱🇺", "🇱🇻", "🇱🇾",
    "🇲🇦", "🇲🇨", "🇲🇩", "🇲🇪", "🇲🇫", "🇲🇬", "🇲🇭", "🇲🇰", "🇲🇱", "🇲🇲",
    "🇲🇳", "🇲🇴", "🇲🇵", "🇲🇶", "🇲🇷", "🇲🇸", "🇲🇹", "🇲🇺", "🇲🇻", "🇲🇼",
    "🇲🇽", "🇲🇾", "🇲🇿", "🇳🇦", "🇳🇨", "🇳🇪", "🇳🇫", "🇳🇬", "🇳🇮", "🇳🇱",
    "🇳🇴", "🇳🇵", "🇳🇷", "🇳🇺", "🇳🇿", "🇴🇲", "🇵🇦", "🇵🇪", "🇵🇫", "🇵🇬",
    "🇵🇭", "🇵🇰", "🇵🇱", "🇵🇲", "🇵🇳", "🇵🇷", "🇵🇸", "🇵🇹", "🇵🇼", "🇵🇾",
    "🇶🇦", "🇷🇪", "🇷🇴", "🇷🇸", "🇷🇺", "🇷🇼", "🇸🇦", "🇸🇧", "🇸🇨", "🇸🇩",
    "🇸🇪", "🇸🇬", "🇸🇭", "🇸🇮", "🇸🇯", "🇸🇰", "🇸🇱", "🇸🇲", "🇸🇳", "🇸🇴",
    "🇸🇷", "🇸🇸", "🇸🇹", "🇸🇻", "🇸🇽", "🇸🇾", "🇸🇿", "🇹🇦", "🇹🇨", "🇹🇩",
    "🇹🇫", "🇹🇬", "🇹🇭", "🇹🇯", "🇹🇰", "🇹🇱", "🇹🇲", "🇹🇳", "🇹🇴", "🇹🇷",
    "🇹🇹", "🇹🇻", "🇹🇼", "🇹🇿", "🇺🇦", "🇺🇬", "🇺🇲", "🇺🇳", "🇺🇸", "🇺🇾",
    "🇺🇿", "🇻🇦", "🇻🇨", "🇻🇪", "🇻🇬", "🇻🇮", "🇻🇳", "🇻🇺", "🇼🇫", "🇼🇸",
    "🇽🇰", "🇾🇪", "🇾🇹", "🇿🇦", "🇿🇲", "🇿🇼", "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  ],
};

export default function EmojiPicker({ selectedEmoji, onSelect }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    setIsOpen(false);
    setSearchQuery("");
  };

  // Filter emojis based on search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return EMOJI_CATEGORIES;
    }

    const query = searchQuery.toLowerCase().trim();
    const result: Record<string, string[]> = {};

    Object.entries(EMOJI_CATEGORIES).forEach(([category, emojis]) => {
      const matchingEmojis = emojis.filter((emoji) => {
        // Check if emoji itself contains the query
        if (emoji.includes(query)) return true;
        
        // Check keywords
        const keywords = EMOJI_KEYWORDS[emoji] || [];
        return keywords.some((keyword) => keyword.toLowerCase().includes(query));
      });

      if (matchingEmojis.length > 0) {
        result[category] = matchingEmojis;
      }
    });

    return result;
  }, [searchQuery]);

  const totalFilteredEmojis = useMemo(() => {
    return Object.values(filteredCategories).flat().length;
  }, [filteredCategories]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Emoji button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-3 py-2 bg-gradient-to-r from-pink-100 to-purple-100 hover:from-pink-200 hover:to-purple-200 rounded-xl border-2 border-purple-200 transition-all hover:scale-105"
        title="Pick an emoji!"
      >
        <span className="text-2xl">{selectedEmoji}</span>
        <ChevronDown className={`w-4 h-4 text-purple-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-2xl shadow-2xl border-2 border-purple-200 w-80 max-h-[28rem] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
          {/* Fixed Header */}
          <div className="bg-gradient-to-r from-purple-100 to-pink-100 px-4 py-3 border-b-2 border-purple-200 shrink-0">
            <p className="text-sm font-bold text-purple-600 text-center">
              ✨ Pick your emoji! ✨
            </p>
            
            {/* Search Input */}
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search emojis... (cat, happy, star)"
                className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border-2 border-purple-200 focus:border-purple-400 focus:outline-none bg-white placeholder-purple-300"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-purple-100 rounded-full"
                >
                  <X className="w-4 h-4 text-purple-400" />
                </button>
              )}
            </div>
            
            <p className="text-xs text-purple-500 text-center mt-2">
              {searchQuery 
                ? `Found ${totalFilteredEmojis} emoji${totalFilteredEmojis !== 1 ? 's' : ''}`
                : `${Object.values(EMOJI_CATEGORIES).flat().length} emojis to choose from!`
              }
            </p>
          </div>
          
          {/* Scrollable Content */}
          <div className="overflow-y-auto flex-1 p-3">
            {Object.keys(filteredCategories).length === 0 ? (
              <div className="text-center py-8">
                <p className="text-4xl mb-2">🔍</p>
                <p className="text-gray-500 text-sm">No emojis found for &quot;{searchQuery}&quot;</p>
                <p className="text-gray-400 text-xs mt-1">Try searching for: cat, star, happy, food...</p>
              </div>
            ) : (
              Object.entries(filteredCategories).map(([category, emojis]) => (
                <div key={category} className="mb-4">
                  <div className="bg-gray-50 rounded-lg px-2 py-1 mb-2 sticky top-0">
                    <p className="text-xs font-bold text-gray-600">
                      {category} <span className="text-gray-400 font-normal">({emojis.length})</span>
                    </p>
                  </div>
                  <div className="grid grid-cols-8 gap-0.5">
                    {emojis.map((emoji, index) => (
                      <button
                        key={`${emoji}-${index}`}
                        onClick={() => handleSelect(emoji)}
                        className={`text-xl p-1 rounded-lg hover:bg-purple-100 transition-all hover:scale-110 ${
                          selectedEmoji === emoji ? "bg-purple-200 ring-2 ring-purple-400" : ""
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

