# -*- coding: utf-8 -*-
from __future__ import annotations

import json

import pytest

from utils.graphql_ops import (
    GraphQlParseError,
    build_query_leaf_poc,
    lab_graphql_shape,
    parse_introspection_ops,
    parse_sdl_ops,
)


SDL = """
type Query {
  products: [Product]
  product(id: ID!): Product
}
type Mutation {
  login(email: String!, password: String!): AuthPayload
}
"""


INTROSPECTION = {
    "data": {
        "__schema": {
            "queryType": {"name": "Query"},
            "mutationType": {"name": "Mutation"},
            "subscriptionType": None,
            "types": [
                {
                    "name": "Query",
                    "fields": [
                        {"name": "products", "description": "all"},
                        {"name": "product", "description": "one"},
                    ],
                },
                {
                    "name": "Mutation",
                    "fields": [{"name": "login", "description": "auth"}],
                },
            ],
        }
    }
}


def test_lab_shape_honest_no_executor():
    shape = lab_graphql_shape(endpoint="http://juice/graphql")
    assert shape["executor"] is False
    assert shape["kind"] == "graphql_lab"


def test_parse_sdl_ops():
    out = parse_sdl_ops(SDL)
    names = {(o["kind"], o["name"]) for o in out["operations"]}
    assert ("query", "products") in names
    assert ("mutation", "login") in names


def test_parse_introspection_ops():
    out = parse_introspection_ops(json.dumps(INTROSPECTION))
    assert any(o["name"] == "product" for o in out["operations"])


def test_sdl_reject_empty():
    with pytest.raises(GraphQlParseError):
        parse_sdl_ops("scalar Date")


def test_query_leaf_poc():
    poc = build_query_leaf_poc("products", endpoint="http://x/graphql")
    assert poc["ok"] is True
    assert poc["request"]["json"]["query"] == "query { products }"
