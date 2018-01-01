import {
  mergeTypeDefs, ResolverService, SchemaDefinition,
  standardSchemaDefinition
} from '@ts-app/graphql'
import { loadFile } from '@ts-app/common'
import { TodoService } from './TodoService'
import { securitySchemaDefinition } from '@ts-app/security'
import { MongoService } from '@ts-app/mongo'

export const todoSchemaDefinition = ({ mongoService }: { mongoService: MongoService }): SchemaDefinition => {
  const resolver = ResolverService.getInstance()

  const standard = standardSchemaDefinition()
  const security = securitySchemaDefinition({ mongoService })

  const todoService = new TodoService()
  resolver.registerService(todoService)

  const typeDefs = mergeTypeDefs([ loadFile(`${__dirname}/todo.graphqls`) ])
  // create resolvers after all services with "@Resolver" are registered
  const resolvers = resolver.makeResolvers()

  return {
    resolvers, typeDefs,
    dependencies: {
      standard,
      security
    }
  }
}
