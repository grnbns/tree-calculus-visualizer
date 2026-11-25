import { describe, it, expect } from 'vitest'
import { layoutTree, kindOf } from './render'
import { parse, D, I } from './parser'

describe('layoutTree', () => {
  it('lays out a single leaf at the origin', () => {
    const { nodes, links } = layoutTree([])
    expect(nodes).toEqual([{ path: [], x: 0, y: 0, kind: 'leaf' }])
    expect(links).toEqual([])
  })

  it('has one node per tree node and one link per branch', () => {
    const { nodes, links } = layoutTree(parse(I)) // 5 nodes, 4 branches
    expect(nodes).toHaveLength(5)
    expect(links).toHaveLength(4)
  })

  it('draws D like Figure 3.3: stem on the left, fork on the right', () => {
    const { nodes } = layoutTree(parse(D))
    const at = (...path: number[]) => nodes.find((n) => n.path.join() === path.join())!
    expect(at().kind).toBe('fork')
    expect(at(0).kind).toBe('stem')
    expect(at(1).kind).toBe('fork')
    // first branch on the left
    expect(at(0).x).toBeLessThan(at(1).x)
    // children are one level below their parent
    expect(at(0).y).toBeGreaterThan(at().y)
    expect(at(0, 0).y).toBeGreaterThan(at(0).y)
    // a stem's only child sits directly below it
    expect(at(0, 0).x).toBeCloseTo(at(0).x)
    // fork's branches in order
    expect(at(1, 0).x).toBeLessThan(at(1, 1).x)
  })

  it('keeps branch order for 3+ branches and marks computations', () => {
    const { nodes } = layoutTree(parse('△△(△△)△'))
    const root = nodes.find((n) => n.path.length === 0)!
    expect(root.kind).toBe('computation')
    const children = nodes.filter((n) => n.path.length === 1).sort((a, b) => a.path[0] - b.path[0])
    const xs = children.map((c) => c.x)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
  })

  it('classifies nodes by number of branches', () => {
    expect(kindOf([])).toBe('leaf')
    expect(kindOf([[]])).toBe('stem')
    expect(kindOf([[], []])).toBe('fork')
    expect(kindOf([[], [], []])).toBe('computation')
  })
})
