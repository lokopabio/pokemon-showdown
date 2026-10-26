export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {
	
	mindseye: {
		inherit: true,
		gen: 7,
		isNonstandard: null,
	},
	punkrock: {
		inherit: true,
		gen: 7,
		isNonstandard: null,
	},
	supremeoverlord: {
		inherit: true,
		gen: 7,
		isNonstandard: null,
	},
	darkaura: {
		inherit: true,
		flags: { breakable: 1 },
	},
	fairyaura: {
		inherit: true,
		flags: { breakable: 1 },
	},
	innerfocus: {
		inherit: true,
		rating: 1,
		onTryBoost() {},
	},
	moody: {
		inherit: true,
	},
	oblivious: {
		inherit: true,
		onTryBoost() {},
	},
	owntempo: {
		inherit: true,
		onTryBoost() {},
	},
	rattled: {
		onDamagingHit(damage, target, source, move) {
			if (['Dark', 'Bug', 'Ghost'].includes(move.type)) {
				this.boost({ spe: 1 });
			}
		},
		name: "Rattled",
		rating: 1.5,
		num: 155,
	},
	scrappy: {
		inherit: true,
		onTryBoost() {},
	},
	slowstart: {
		inherit: true,
		onModifyAtk(atk, pokemon, target, move) {
			// This is because the game checks the move's category in data, rather than what it is currently, unlike e.g. Huge Power
			if (this.effectState.counter && this.dex.moves.get(move.id).category === 'Physical') {
				return this.chainModify(0.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(spa, pokemon, target, move) {
			// Ordinary Z-moves like Breakneck Blitz will halve the user's Special Attack as well
			if (this.effectState.counter && this.dex.moves.get(move.id).category === 'Physical') {
				return this.chainModify(0.5);
			}
		},
	},
	soundproof: {
		inherit: true,
		onTryHit(target, source, move) {
			if (move.flags['sound']) {
				this.add('-immune', target, '[from] ability: Soundproof');
				return null;
			}
		},
	},
	technician: {
		inherit: true,
		onBasePowerPriority: 19,
	},
};
