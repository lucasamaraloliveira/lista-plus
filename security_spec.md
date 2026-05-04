# Security Spec

1. Data Invariants:
- A list must have an ownerId matching the creator.
- A list must have a members array containing at least the ownerId.
- Access to list items requires the user to be in the members array of the parent list.
- An item requires a valid unit (`pacote`, `caixa`, `unidade`).

2. The Dirty Dozen:
- Create list with different ownerId
- Create list where ownerId is not in members array
- Add item to list without being a member
- Update item in list without being a member
- Update list name and also try to change ownerId
- Read items from someone else's list
- Create item with invalid unit
- Update item setting status `purchased` but altering `authorId`
- Read a list without being a member
- Delete a list without being the owner (only owner can delete)
- Update item with negative price or negative quantity
- Create an item skipping `createdAt`

3. Test Runner will verify these in `firestore.rules.test.ts`.
