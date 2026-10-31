"""Budget comparison on frozen inferred native states; no new opponent sampling."""
import argparse
import hashlib
import json
from pathlib import Path

def compare(samples, budgets, repeats, state_factory, search, split_count=None):
    if not samples or any(s['weight'] < 0 for s in samples) or sum(s['weight'] for s in samples) <= 0:
        raise ValueError('Invalid sample weights')
    output = []
    total_weight = sum(s['weight'] for s in samples)
    for budget in budgets:
        for repeat in range(repeats):
            actions, detail = {}, []
            for sample in samples:
                # Fresh state instance prevents a prior search from changing inputs.
                state = state_factory(sample['nativeState'])
                result = search(state, max(1, budget // (split_count or len(samples))), threads=1)
                visits = sum(a.visits for a in result.side_one) or 1
                per_sample = []
                for action in result.side_one:
                    actions[action.move_choice] = actions.get(action.move_choice, 0) + sample['weight'] / total_weight * action.visits / visits
                    per_sample.append({'action': action.move_choice, 'visits': action.visits,
                                       'meanSearchScore': action.total_score / action.visits if action.visits else None})
                detail.append({'stateSHA256': hashlib.sha256(sample['nativeState'].encode()).hexdigest(), 'actions': per_sample})
            output.append({'budgetMs': budget, 'repeat': repeat, 'best': max(actions, key=actions.get),
                           'visitWeights': actions, 'samples': detail})
    return output

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    parser.add_argument('--output', required=True)
    parser.add_argument('--budgets', default='30,100,300')
    parser.add_argument('--repeats', type=int, default=3)
    parser.add_argument('--maxPositions', type=int, default=12)
    args = parser.parse_args()
    budgets = [int(x) for x in args.budgets.split(',')]
    if not budgets or any(b < 3 or b > 3000 for b in budgets) or not 1 <= args.repeats <= 10 or not 1 <= args.maxPositions <= 100:
        raise ValueError('Invalid comparison limits')
    from poke_engine import State, monte_carlo_tree_search
    rows = [json.loads(line) for line in Path(args.input).read_text(encoding='utf-8').splitlines() if line]
    positions = [r for r in rows if r.get('type') == 'decision' and r.get('search', {}).get('diagnostic')]
    # Inspect suspicious low-HP boosted passers first, then the earliest decisions.
    def priority(row):
        own = row['search']['diagnostic']['own']['active']
        if own and own['hp'] <= 1 and any(m['name'] == 'batonpass' for m in own['moves']):
            return 0
        opponent = row['search']['diagnostic']['observedOpponent']['active']
        if opponent and opponent['name'] == 'ladesaurio' and any(v > 0 for v in (opponent['boosts'] or {}).values()):
            return 1
        return 2
    positions.sort(key=priority)
    if not positions:
        raise ValueError('No native snapshots in input; capture diagnostics first')
    destination = Path(args.output)
    with destination.open('x', encoding='utf-8') as stream:
        for row in positions[:args.maxPositions]:
            diagnostic = row['search']['diagnostic']
            stream.write(json.dumps({'turn': row['turn'], 'side': row['side'], 'originalChoice': row['choice'],
                'ownActive': diagnostic['own']['active'],
                'comparison': compare(diagnostic['samples'], budgets, args.repeats, State.from_string, monte_carlo_tree_search, diagnostic.get('hypothesisBudgetDivisor')),
                'limitation': 'Search scores are internal evaluations, not calibrated win probabilities. Larger budgets do not establish correct play.'}) + '\n')
    print(json.dumps({'positions': min(len(positions), args.maxPositions), 'output': str(destination)}))

if __name__ == '__main__':
    main()
