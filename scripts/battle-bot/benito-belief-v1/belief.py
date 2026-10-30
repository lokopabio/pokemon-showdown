"""Experimental structural priors and scenario scoring; not calibrated probabilities."""
import math

def affinity(ability, moves, catalog):
    # Generic move effect flags, never species-specific rules.
    flags = {'megalauncher':'pulse', 'strongjaw':'bite', 'ironfist':'punch'}
    weight = 1.0
    for name in set(moves):
        move = catalog.get(name, {})
        flag = flags.get(ability)
        if flag and move.get('flags', {}).get(flag):
            weight *= 1.5
        if ability == 'technician' and 0 < move.get('basePower', 0) <= 60:
            weight *= 1.3
    return min(weight, 4.0)

def choose_action(samples, legal, downside=0.25):
    """Compare scenario means, penalizing dispersion; missing actions fail closed.

    Native rollout scores are engine evaluation scores, not calibrated win odds.
    Each sampled set is a scenario, not a deliberate opponent move.
    """
    if not 0 <= downside <= 1 or not samples:
        raise ValueError('Invalid scenario comparison')
    total = sum(s['weight'] for s in samples)
    if total <= 0 or not math.isfinite(total) or any(s['weight'] < 0 for s in samples):
        raise ValueError('Invalid weights')
    out = {}
    for action in legal:
        values = []
        for sample in samples:
            row = next((r for r in sample['actions'] if r['action'] == action), None)
            if row is None or row['visits'] <= 0:
                break
            value = row['totalScore'] / row['visits']
            if not math.isfinite(value):
                raise ValueError('Nonfinite native score')
            values.append((sample['weight']/total, value))
        if len(values) != len(samples):
            continue
        mean = sum(w*v for w,v in values)
        deviation = math.sqrt(sum(w*(v-mean)**2 for w,v in values))
        out[action] = {'mean':mean, 'scenarioStdDev':deviation, 'objective':mean-downside*deviation}
    if not out:
        raise ValueError('No action visited in every scenario')
    return max(out, key=lambda a:out[a]['objective']), out

def install_prior():
    # Scoped to this child process; external Foul Play files are untouched.
    import inspect
    from fp.data.sets import roman_open
    source = inspect.getsource(roman_open.sample_open_pokemon)
    old = 'random.choice(compatible)'
    if source.count(old) != 1:
        raise ValueError('Unexpected sampler; refusing experimental patch')
    roman_open.__dict__['_belief_affinity'] = lambda p,c: affinity(c.pkmn_set.ability, [m.name for m in p.moves], roman_open.all_move_json)
    source = source.replace(old, 'random.choices(compatible, weights=[_belief_affinity(pkmn,c) for c in compatible], k=1)[0]')
    exec(compile(source, '<benito experimental prior>', 'exec'), roman_open.__dict__)
