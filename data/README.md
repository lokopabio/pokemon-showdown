### Custom Modification

data/abilities.ts: this is where all abilities go. You can code out custom abilities like any other pre-existing one, check mine at https://github.com/TheAnimemer/pokemon-showdown/blob/a06f35d788f33276e746420e480051d337d7b805/data/abilities.ts#L5584 for inspiration. Keep all new abilities 

data/formats-data.ts: all this file does is give your mons a "tier" in the teambuilder. You can rank them however you want just make sure they all have an entry here.

data/mods/moodmons/learnsets.ts: this is where every mons movepool is listed. again, it's pretty intuitive to figure out, shouldn't be hard. off the top of my head, [9L4] essentially means "in gen 9, this mon learns this move at level 4." [9M] means it learns it from a either TM, level-up, egg move or move tutor. for most cases, you can use [9M] for everything unless its important to you to specify where it was learned.

data/mods/moodmons/moves.ts: this is where CUSTOM moves go. If you want to change an existing move, @TheAnimemer on discord and I'll show you how. Otherwise you can code out custom moves like any other pre-existing move, check data/moves.ts for inspiration. I left some examples in the file as well to get you started with a template / rough idea.

data/mods/moodmons/pokedex.ts: this is arguably the most important file. Every CUSTOM mon needs to have an entry here to exist. There's examples of how to write it out left in the file, so use those for reference. 

data/mods/moodmons/scripts.ts: Don't touch.

###Format config.

config/formats.ts: https://github.com/TheAnimemer/pokemon-showdown/blob/37cd94fcd9c49651df47b3ed48f60364c017047e/config/formats.ts#L991

It's this file that determines what is allowed in the actual playable format. All of your custom mons need to be put in the unbanlist here to be legal. this is also where clauses are determined for the tier. you can rename the format to whatever you like here as well.
