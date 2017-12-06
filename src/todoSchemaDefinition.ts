import { mergeTypeDefs, ResolverService } from '@ts-app/graphql'
import { loadFile } from '@ts-app/common'
import { TodoService } from './TodoService'

export const todoSchemaDefinition = () => {
  const resolver = ResolverService.getInstance()

  const todoService = new TodoService()
  resolver.registerService(todoService)

  const typeDefs = mergeTypeDefs([ loadFile(`${__dirname}/todo.graphqls`) ])

  // create resolvers after all services with "@Resolver" are registered
  const resolvers = resolver.makeResolvers()

  return { resolvers, typeDefs }
}
