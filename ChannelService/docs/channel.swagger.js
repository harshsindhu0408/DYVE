/*  
openapi: 3.0.0
info:
  title: Channel API
  description: API for managing communication channels in workspaces
  version: 1.0.0
servers:
  - url: /api/v1
    description: Main API server

tags:
  - name: Channels
    description: Operations related to workspace channels

paths:
  /channels:
    post:
      tags: [Channels]
      summary: Create a new channel
      description: Create a new channel in a workspace (requires workspace admin privileges)
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateChannelRequest'
      responses:
        '201':
          description: Channel created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ChannelResponse'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          $ref: '#/components/responses/Conflict'
        '500':
          $ref: '#/components/responses/ServerError'

    get:
      tags: [Channels]
      summary: Get all channels
      description: Retrieve all channels (requires authentication)
      security:
        - bearerAuth: []
      responses:
        '200':
          description: List of channels retrieved successfully
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Channel'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'

  /channels/{channelId}:
    get:
      tags: [Channels]
      summary: Get channel by ID
      description: Retrieve a single channel by its ID
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/channelId'
      responses:
        '200':
          description: Channel details retrieved successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Channel'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'

    patch:
      tags: [Channels]
      summary: Update a channel
      description: Update channel details (requires workspace admin privileges)
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/channelId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateChannelRequest'
      responses:
        '200':
          description: Channel updated successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Channel'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '409':
          $ref: '#/components/responses/Conflict'
        '500':
          $ref: '#/components/responses/ServerError'

    delete:
      tags: [Channels]
      summary: Delete a channel
      description: Delete a channel by ID (requires workspace admin privileges)
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/channelId'
      responses:
        '200':
          description: Channel deleted successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Channel'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'

  /channels/archive/{channelId}:
    patch:
      tags: [Channels]
      summary: Archive a channel
      description: Archive a channel by ID (requires workspace admin privileges)
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/channelId'
      responses:
        '200':
          description: Channel archived successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Channel'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'

  /channels/workspace/{workspaceId}:
    get:
      tags: [Channels]
      summary: Get channels by workspace ID
      description: Retrieve all channels belonging to a specific workspace
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/workspaceId'
      responses:
        '200':
          description: List of channels retrieved successfully
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Channel'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'

  /channels/user/{userId}:
    get:
      tags: [Channels]
      summary: Get channels by user ID
      description: Retrieve all channels created by a specific user
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/userId'
      responses:
        '200':
          description: List of channels retrieved successfully
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Channel'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'

  /channels/type/{type}:
    get:
      tags: [Channels]
      summary: Get channels by type
      description: Retrieve all channels of a specific type (public/private)
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/channelType'
      responses:
        '200':
          description: List of channels retrieved successfully
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Channel'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'

  /channels/name/{name}:
    get:
      tags: [Channels]
      summary: Get channels by name
      description: Retrieve all channels with a specific name
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/channelName'
      responses:
        '200':
          description: List of channels retrieved successfully
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Channel'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'

components:
  schemas:
    Channel:
      type: object
      properties:
        _id:
          type: string
          example: 5f8d04b3ab35de3a3427d9f3
        workspaceId:
          type: string
          example: 5f8d04b3ab35de3a3427d9f1
        channelId:
          type: string
          example: C01234567
        name:
          type: string
          example: general
        description:
          type: string
          example: General discussions
        type:
          type: string
          enum: [public, private]
          example: public
        createdBy:
          $ref: '#/components/schemas/UserReference'
        workspaceName:
          type: string
          example: Acme Corp
        isGeneral:
          type: boolean
          example: true
        isArchived:
          type: boolean
          example: false
        topic:
          type: string
          example: Team collaboration
        customSettings:
          $ref: '#/components/schemas/CustomSettings'
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time

    UserReference:
      type: object
      properties:
        userId:
          type: string
          example: 5f8d04b3ab35de3a3427d9f0
        name:
          type: string
          example: John Doe
        avatar:
          type: string
          example: https://example.com/avatar.jpg
        status:
          type: string
          example: active
        bio:
          type: string
          example: Software Developer

    CustomSettings:
      type: object
      properties:
        allowThreads:
          type: boolean
          example: true
        sendWelcomeMessages:
          type: boolean
          example: true
        defaultNotificationPref:
          type: string
          enum: [all, mentions, none]
          example: all

    CreateChannelRequest:
      type: object
      required:
        - workspaceId
        - name
        - workspaceName
      properties:
        workspaceId:
          type: string
          example: 5f8d04b3ab35de3a3427d9f1
        name:
          type: string
          example: general
        description:
          type: string
          example: General discussions
        type:
          type: string
          enum: [public, private]
          default: public
          example: public
        workspaceName:
          type: string
          example: Acme Corp
        isGeneral:
          type: boolean
          default: false
          example: false
        topic:
          type: string
          example: Team collaboration
        customSettings:
          $ref: '#/components/schemas/CustomSettings'

    UpdateChannelRequest:
      type: object
      properties:
        name:
          type: string
          example: general-updated
        description:
          type: string
          example: Updated general discussions
        type:
          type: string
          enum: [public, private]
          example: private
        topic:
          type: string
          example: Updated team collaboration
        customSettings:
          $ref: '#/components/schemas/CustomSettings'
        isArchived:
          type: boolean
          example: false
        workspaceId:
          type: string
          example: 5f8d04b3ab35de3a3427d9f1

    ChannelResponse:
      type: object
      properties:
        success:
          type: boolean
          example: true
        code:
          type: string
          example: CHANNEL_CREATED
        message:
          type: string
          example: Channel created successfully with creator added as member
        data:
          type: object
          properties:
            channel:
              $ref: '#/components/schemas/Channel'
            membership:
              type: object
              properties:
                userId:
                  type: string
                role:
                  type: string
                status:
                  type: string

  parameters:
    channelId:
      name: channelId
      in: path
      description: ID of the channel
      required: true
      schema:
        type: string
      example: 5f8d04b3ab35de3a3427d9f3

    workspaceId:
      name: workspaceId
      in: path
      description: ID of the workspace
      required: true
      schema:
        type: string
      example: 5f8d04b3ab35de3a3427d9f1

    userId:
      name: userId
      in: path
      description: ID of the user
      required: true
      schema:
        type: string
      example: 5f8d04b3ab35de3a3427d9f0

    channelType:
      name: type
      in: path
      description: Type of channel (public/private)
      required: true
      schema:
        type: string
        enum: [public, private]
      example: public

    channelName:
      name: name
      in: path
      description: Name of the channel
      required: true
      schema:
        type: string
      example: general

  responses:
    BadRequest:
      description: Bad request - invalid parameters
      content:
        application/json:
          schema:
            type: object
            properties:
              success:
                type: boolean
                example: false
              code:
                type: string
                example: CHANNEL_ID_REQUIRED
              message:
                type: string
                example: Channel ID is required
              data:
                type: object
                example: null

    Unauthorized:
      description: Unauthorized - authentication required
      content:
        application/json:
          schema:
            type: object
            properties:
              success:
                type: boolean
                example: false
              code:
                type: string
                example: UNAUTHORIZED
              message:
                type: string
                example: User authentication required
              data:
                type: object
                example: null

    Forbidden:
      description: Forbidden - insufficient permissions
      content:
        application/json:
          schema:
            type: object
            properties:
              success:
                type: boolean
                example: false
              code:
                type: string
                example: FORBIDDEN
              message:
                type: string
                example: Workspace admin privileges required
              data:
                type: object
                example: null

    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            type: object
            properties:
              success:
                type: boolean
                example: false
              code:
                type: string
                example: CHANNEL_NOT_FOUND
              message:
                type: string
                example: Channel not found
              data:
                type: object
                example: {channelId: "5f8d04b3ab35de3a3427d9f3"}

    Conflict:
      description: Conflict - resource already exists
      content:
        application/json:
          schema:
            type: object
            properties:
              success:
                type: boolean
                example: false
              code:
                type: string
                example: CHANNEL_ALREADY_EXISTS
              message:
                type: string
                example: A channel with this name already exists
              data:
                type: object
                example: {existingChannel: {_id: "5f8d04b3ab35de3a3427d9f3", name: "general"}}

    ServerError:
      description: Internal server error
      content:
        application/json:
          schema:
            type: object
            properties:
              success:
                type: boolean
                example: false
              code:
                type: string
                example: CHANNEL_CREATION_FAILED
              message:
                type: string
                example: An internal server error occurred
              data:
                type: string
                example: Error details here

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
*/