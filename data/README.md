### Custom Modification
==============================================

data/abilities.ts: this is where all abilities go. You can code out custom abilities like any other pre-existing one, check mine at https://github.com/TheAnimemer/pokemon-showdown/blob/master/data/abilities.ts#L5584 for inspiration. Keep all new abilities 

data/formats-data.ts: this file decides what tiers ALL Pokémon belong to. You can rank them however you want just make sure they all have an entry here. Check Pokémon Mood's file for how to properly remove pre-existing pokemon: https://github.com/NeyOkaou/pokemon-showdown/blob/master/data/formats-data.ts

data/learnsets.ts: this is where every mon's movepool is listed. It's pretty intuitive to figure out, shouldn't be hard. off the top of my head, [9L4] essentially means "in gen 9, this mon learns this move at level 4." [9M] means it learns it from a either TM, level-up, egg move or move tutor. for most cases, you can use [9M] for everything unless its important to you to specify where it was learned.

data/moves.ts: this is where ALL moves go. You can code out custom moves like any other pre-existing move, check https://github.com/TheAnimemer/pokemon-showdown/blob/master/data/moves.ts#L22077 for inspiration. The most important thing to remember is to use negative numbers! the num string for each entry should be -1000, -1001, and so on. 

data/pokedex.ts: this is arguably the most important file. Every Pokemon needs to have an entry here to exist. There's examples of how to write it out in the file, so use those for reference. ALWAYS double check that you have strings in the correct order by looking at previous entries. 

### Sprite Modification
==============================================

All editing will be done in https://github.com/lokopabio/pokemon-sprites/tree/main/sprites

Every sprite needs to be 96x96. They can be slightly larger if you need it to be, but it will be centered weirdly, so try to avoid anything larger. 
When playing, you'll need to check the setting for using BW sprites. If you don't, you won't see custom sprites in the teambuilder. 

Front sprites go in sprites/gen5; Shiny front sprites go in sprites/gen5-shiny
Back sprites go in sprites/gen5-back; Shiny back sprites go in sprites/gen5-back-shiny

Added sprites will appear in Showdown immediately without any restart needed.
