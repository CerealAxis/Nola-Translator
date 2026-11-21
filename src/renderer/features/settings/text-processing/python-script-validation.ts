import { pythonLanguage } from '@codemirror/lang-python'

type PythonNode = ReturnType<typeof pythonLanguage.parser.parse>['topNode']

export type PythonScriptError =
  | { kind: 'syntax'; line: number }
  | { kind: 'entry'; signature: string }

function findDefinition(scope: PythonNode, kind: string, name: string, code: string) {
  for (let child = scope.lastChild; child; child = child.prevSibling) {
    const definition = child.name === 'DecoratedStatement' ? child.getChild(kind) : child
    const identifier = definition?.getChild('VariableName')
    if (definition?.name === kind && identifier && code.slice(identifier.from, identifier.to) === name) {
      return definition
    }
  }
  return null
}

function acceptsPositionals(definition: PythonNode, count: number, code: string) {
  const parameters = definition.getChild('ParamList')
  if (!parameters || definition.getChild('async')) return false

  let minimum = 0
  let maximum = 0
  let keywordOnly = false
  const names = new Set<string>()
  for (let child = parameters.firstChild; child; child = child.nextSibling) {
    if (child.name === '*' || child.name === '**') {
      keywordOnly = true
      if (child.name === '*' && child.nextSibling?.name === 'VariableName') maximum = Infinity
    }
    if (child.name !== 'VariableName') continue
    const name = code.slice(child.from, child.to)
    if (names.has(name)) return false
    names.add(name)
    if (child.prevSibling?.name === '*' || child.prevSibling?.name === '**') continue
    const next = child.nextSibling?.name === 'TypeDef' ? child.nextSibling.nextSibling : child.nextSibling
    const optional = next?.name === 'AssignOp'
    if (keywordOnly) {
      if (!optional) return false
    } else {
      if (!optional && minimum < maximum) return false
      maximum++
      if (!optional) minimum++
    }
  }
  return count >= minimum && count <= maximum
}

function matchesResult(value: PythonNode, result: 'text' | 'pair', code: string): boolean {
  if (value.name === 'ParenthesizedExpression' && value.firstChild?.nextSibling) {
    return matchesResult(value.firstChild.nextSibling, result, code)
  }
  if (value.name === 'TupleExpression' || value.name === 'ArrayExpression') {
    return matchesPair(value.firstChild?.nextSibling ?? null, result, code)
  }
  if (['None', 'Number', 'Boolean', 'DictionaryExpression', 'SetExpression'].includes(value.name)) return false
  if (value.name === 'String' && /^[br]*b/i.test(code.slice(value.from, value.to))) return false
  return result === 'text' || !['String', 'FormatString', 'ContinuedString'].includes(value.name)
}

function matchesPair(first: PythonNode | null, result: 'text' | 'pair', code: string) {
  if (result !== 'pair' || !first) return false
  let commas = 0
  let lastWasComma = false
  for (let child: PythonNode | null = first; child && child.name !== ')' && child.name !== ']'; child = child.nextSibling) {
    if (child.name === '*') return true
    lastWasComma = child.name === ','
    if (lastWasComma) commas++
  }
  return commas + Number(!lastWasComma) === 2 && matchesResult(first, 'text', code)
}

function hasCompatibleReturn(definition: PythonNode, result: 'text' | 'pair', code: string) {
  let hasReturn = false
  let incompatible = false
  definition.getChild('Body')?.cursor().iterate(node => {
    if (['FunctionDefinition', 'ClassDefinition', 'LambdaExpression'].includes(node.name)) return false
    if (node.name === 'YieldStatement' || node.name === 'YieldExpression') incompatible = true
    if (node.name === 'ReturnStatement') {
      const first = node.node.firstChild?.nextSibling ?? null
      hasReturn = true
      const matches = node.node.getChild(',') ? matchesPair(first, result, code)
        : first && matchesResult(first, result, code)
      if (!matches) incompatible = true
    }
  })
  return hasReturn && !incompatible
}

export function validatePythonScript(code: string, preprocessing: boolean): PythonScriptError | undefined {
  const tree = pythonLanguage.parser.parse(code)
  let errorPosition: number | undefined
  tree.iterate({ enter(node) {
    if (errorPosition === undefined && node.type.isError) errorPosition = node.from
  } })
  if (errorPosition !== undefined) {
    return { kind: 'syntax', line: code.slice(0, errorPosition).split('\n').length }
  }

  if (preprocessing) {
    const entry = findDefinition(tree.topNode, 'FunctionDefinition', 'POSTSOLVE', code)
    if (!entry || !acceptsPositionals(entry, 1, code) || !hasCompatibleReturn(entry, 'text', code)) {
      return { kind: 'entry', signature: 'POSTSOLVE(text) -> str' }
    }
    return
  }

  const processBody = findDefinition(tree.topNode, 'ClassDefinition', 'Process', code)?.getChild('Body')
  if (!processBody) return { kind: 'entry', signature: 'class Process' }
  const initializer = findDefinition(processBody, 'FunctionDefinition', '__init__', code)
  if (initializer && !acceptsPositionals(initializer, 1, code)) return { kind: 'entry', signature: 'Process()' }

  for (const [name, count, signature, result] of [
    ['process_before', 2, 'Process.process_before(self, text) -> tuple[str, object]', 'pair'],
    ['process_after', 3, 'Process.process_after(self, text, context) -> str', 'text'],
  ] as const) {
    const entry = findDefinition(processBody, 'FunctionDefinition', name, code)
    const decorators = entry?.parent?.getChildren('Decorator') ?? []
    const isStatic = decorators.some(node => code.slice(node.from, node.to).trim() === '@staticmethod')
    if (!entry || !acceptsPositionals(entry, count - Number(isStatic), code) || !hasCompatibleReturn(entry, result, code)) {
      return { kind: 'entry', signature }
    }
  }
}
