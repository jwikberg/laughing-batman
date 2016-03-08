DREAMS
=======

> **D**ynamic **R**estful **E**xpressJS **A**nd **M**ongoDB **S**ervice

## What?

This is a REST API server built using ExpressJS and MongoDB.
It has dynamic endpoints, e.g. `POST /item` will create a MongoDB collection called `item` and insert the posted body into the collection. The stored "item" can then be retreived by `GET /item`.

## Get started

Install [NodeJS](http://nodejs.org/download/) and [MongoDB](https://www.mongodb.org/downloads).


```bash
git clone <this repo>

cd <repo folder>

npm install

npm start
```

You'll now have a dynamic REST API listening on port `3232` (or the port provided via `PORT` env variable).

## API

**NOTE** `<resource>` and `<relatedResource>` below should be a resource name in singular and dasherized, e.g. "user" or "continuous-integration". `<id>` should be a 24 character long hexadecimal string, i.e. a MongoDB ObjectID string.

### `POST /_hook/github/<endpoint>`

Can and should be used as a GitHub push webhook to automatically add a repo to the build queue used by [flaming-computing-machine](https://github.com/Softhouse/flaming-computing-machine).

**NOTE** Your repo *must* have a `Dockerfile` in its root folder! Also it listens only for `master` branch pushes.

#### Responses

`201` - The repo was added to the build queue

`204` - Push received but ignored (e.g. push to other branch than `master`)

`500` - Something went wrong when querying the database.


### `POST /_hook/bitbucket/<endpoint>`

Can and should be used as a BitBucket push webhook to automatically add a repo to the build queue used by [flaming-computing-machine](https://github.com/Softhouse/flaming-computing-machine).

**NOTE** Your repo *must* have a `Dockerfile` in its root folder! Also it listens only for `master` branch pushes.

**NOTE** All of the private repositories needs to exist in the config/default.json file; see the actual file for an example. Further, [flaming-computing-machine](https://github.com/Softhouse/flaming-computing-machine) needs to have the ssh keys set up to match these repositories; [flaming-computing-machine](https://github.com/Softhouse/flaming-computing-machine) has a description on how to set this up.

#### Responses

`201` - The repo was added to the build queue

`204` - Push received but ignored (e.g. push to other branch than `master`)

`500` - Something went wrong when querying the database.

### `POST /_indices/<resource>`

Adds indice/s to `<resource>`.

Expects the indices to be added in the body:

    field: 1
    field2: -1

1 means asc and -1 desc.

**Be aware that this uses alot of extra memory, use only when you know what you are doing.**

#### Responses

`201` - The indice/s was added to the `<resource>`.

`400` - The JSON body was omitted when the request was made.

`500` - Something went wrong when querying the database.

### `DELETE /_indices/<resource>`

Will remove all indices on `<resource>`.

#### Responses

`204` - The indices were removed from the `<resource>` collection.

`500` - Something went wrong when querying the database. Indices are not removed.


### `GET /<resource>[?query...]`

Get all items of a given `<resource>`.

Supports:

- **sort**=name,-create_at // - will sort desc, otherwise asc
- **limit**=10 // or any specific number
- **skip**=5 // or any specific number.

#### Responses

`200` - An array with all, or no, items in the `<resource>` collection, optionally filtered by provided query parameters.

`500` - Something went wrong when querying the database.


### `GET /<resource>/<id>`

Get a resource item by its id.

#### Responses

`200` - The item with id `<id>` in the `<resource>` collection.

`404` - No item with id `<id>` was found in the collection.

`500` - Something went wrong when querying the database.


### `POST /<resource>`

Create a new item for a resource.

#### Responses

`200` - The given JSON body was saved to the `<resource>` collection and returned in the response.

`400` - The JSON body was omitted when the request was made.

`500` - The item could not be saved.


### `PUT /<resource>/<id>`

Update a specific item by id in a resource collection.

#### Responses

`204` - The given JSON body was used to replace the old item with id `<id>` in the `<resource>` collection.

`400` - The JSON body was omitted when the request was made.

`500` - The item could not be saved.


### `DELETE /<resource>/<id>`

Delete a specific item by id in a resource collection.

#### Responses

`204` - The item with id `<id>` was removed from the `<resource>` collection.

`404` - The item with id `<id>` was not found in the `<resource>` collection.

`500` - The item could not be removed.


### `GET /<resource>/<id>/<relatedResource>[?query...]`

Get all related items of a given type for a specific item in a collection.

Supports:

- **sort**=name,-create_at // - will sort desc, otherwise asc
- **limit**=10 // or any specific number
- **skip**=5 // or any specific number.

#### Responses

`200` - An array with all, or no, items in the `<relatedResource>` collection which belongs to the item with id `<id>` in the `<resource>` collection, optionally filtered by provided query parameters.

`500` - Something went wrong when querying the database.


### `POST /<resource>/<id>/<relatedResource>`

Create and connect a related item of a given type for a specific item in a collection.

#### Responses

`200` - The given JSON body was saved to the `<relatedResource>` collection, connected to item with id `<id>` in the `<resource>` collection and returned in the response.

`400` - The JSON body was omitted when the request was made.

`500` - The item could not be saved.


### `GET /_collection`

Get all collection names.

#### Responses

`200` - An array with all, or no, collection names in the database.

`500` - Something went wrong when querying the database.


### `GET /_collection/<resource>`

Get statistics and calculated document schema for a given resource.

#### Responses

`200` - An object with collection name, item count and calculated document schema for the given resource.

`500` - Something went wrong when querying the database.


## License

MIT
