import * as crypto from 'crypto'
import { Resolver, userIdMatchParam } from '@ts-app/graphql'
import { DefaultRoles } from '@ts-app/security'
import { ResolverMiddlewareInput } from '@ts-app/graphql'

const uuid = () => crypto.randomBytes(16).toString('hex')

export type Todo = {
  id: string
  title: string
  completed: boolean
  createdAt: Date
  ownerId: string
  ownerName: string
}

export class TodoService {
  _todos: {
    [key: string]: Todo
  } = {}

  @Resolver({ auth: [ DefaultRoles.User ] })
  async todos (dummy?: any, resolverParams?: ResolverMiddlewareInput): Promise<{ error?: string, docs?: Todo[] }> {
    const user = resolverParams && resolverParams.user
    if (!user) {
      return { error: 'Unknown user' }
    }
    const docs = Object
      .keys(this._todos)
      .map(id => this._todos[ id ])
      // only show todos that belong to current user
      .filter(todo => user.id === todo.ownerId)
    return { docs }
  }

  @Resolver({ auth: [ DefaultRoles.User ], type: 'mutation', paramNames: [ 'title' ] })
  async createTodo (title: string, resolverParams?: ResolverMiddlewareInput): Promise<{ error?: string, id?: string }> {
    const user = resolverParams && resolverParams.user

    if (!user) {
      return { error: 'Unknown user' }
    }

    const ownerId = user.id
    const ownerName = user.profile!.name
    const id = uuid()
    this._todos[ id ] = {
      id, title,
      completed: false,
      createdAt: new Date(),
      ownerId,
      ownerName
    }

    return { id }
  }

  @Resolver({ auth: userIdMatchParam('ownerId'), type: 'mutation' })
  updateTodo ({ id, title, ownerId }: { id: string, title: string, ownerId: string }): { error?: string } {
    // if this function executes as a GraphQL resolver, "ownerId" will be current user's ID because of userIdMatchParam()

    const todo = this._todos[ id ]

    if (!todo) {
      return { error: `Todo [${id}] not found` }
    }
    if (todo.ownerId !== ownerId) {
      return { error: `Todo [${id}] does not belong to specified owner [${ownerId}]` }
    }

    todo.title = title

    return {}
  }

  @Resolver({
    auth: userIdMatchParam('ownerId'),
    paramNames: [ 'id', 'ownerId' ],
    type: 'mutation'
  })
  deleteTodo (id: string, ownerId: string): { error?: string } {
    const todo = this._todos[ id ]

    if (!todo) {
      return { error: `Todo [${id}] not found` }
    }
    if (todo.ownerId !== ownerId) {
      return { error: `Todo [${id}] does not belong to specified owner [${ownerId}]` }
    }

    delete this._todos[ id ]
    return {}
  }

  @Resolver({ auth: userIdMatchParam('ownerId'), type: 'mutation' })
  markCompleted ({ id, completed, ownerId }: { id: string, completed: boolean, ownerId: string }): { error?: string } {
    const todo = this._todos[ id ]
    if (!todo) {
      return { error: `Todo [${id}] not found` }
    }
    if (todo.ownerId !== ownerId) {
      return { error: `Todo [${id}] does not belong to specified owner [${ownerId}]` }
    }

    todo.completed = completed
    return {}
  }

  @Resolver({ type: 'mutation' })
  deleteCompleted () {
    throw new Error('Not implemented!')
  }
}
