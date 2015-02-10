DREAMS
=======

> **D**ynamic **R**estful **E**xpressJS **A**nd **M**ongoDB **S**ervice

## What?

This is a REST API server built using ExpressJS and MongoDB.
It has dynamic endpoints, e.g. `POST /api/item` will create a MongoDB collection called `item` and insert the posted body into the collection. The stored "item" can then be retreived by `GET /api/item`.

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

### `GET /api/<resource>`

Get all items of a given resource.

#### Responses

`200` - An array with all, or no, items in the `<resource>` collection.

`500` - Something went wrong when querying the database.


### `GET /api/<resource>/<id>`

Get a resource item by its id.

#### Responses

`200` - The item with id `<id>` in the `<resource>` collection.

`404` - No item with id `<id>` was found in the collection.

`500` - Something went wrong when querying the database.


### `POST /api/<resource>`

Create a new item for a resource.

#### Responses

`200` - The given JSON body was saved to the `<resource>` collection and returned in the response.

`400` - The JSON body was omitted when the request was made.

`500` - The item could not be saved.


### `PUT /api/<resource>/<id>`

Update a specific item by id in a resource collection.

#### Responses

`204` - The given JSON body was used to replace the old item with id `<id>` in the `<resource>` collection.

`400` - The JSON body was omitted when the request was made.

`500` - The item could not be saved.


### `DELETE /api/<resource>/<id>`

Delete a specific item by id in a resource collection.

#### Responses

`204` - The item with id `<id>` was removed from the `<resource>` collection.

`404` - The item with id `<id>` was not found in the `<resource>` collection.

`500` - The item could not be removed.


### `GET /api/<resource>/<id>/<relatedResource>`

Get all related items of a given type for a specific item in a collection.

#### Responses

`200` - An array with all, or no, items in the `<relatedResource>` collection which belongs to the item with id `<id>` in the `<resource>` collection.

`500` - Something went wrong when querying the database.


### `POST /api/<resource>/<id>/<relatedResource>`

Create and connect a related item of a given type for a specific item in a collection.

#### Responses

`200` - The given JSON body was saved to the `<relatedResource>` collection, connected to item with id `<id>` in the `<resource>` collection and returned in the response.

`400` - The JSON body was omitted when the request was made.

`500` - The item could not be saved.


### `GET /collection`

Get all collection names.

#### Responses

`200` - An array with all, or no, collection names in the database.

`500` - Something went wrong when querying the database.


### `GET /collection/<resource>`

Get statistics and calculated document schema for a given resource.

#### Responses

`200` - An object with collection name, item count and calculated document schema for the given resource.

`500` - Something went wrong when querying the database.


## License

MIT
