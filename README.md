# Vote for Us

### Description

This library provides everything needed to integrate a button into a website, allowing users to vote for a block producer on a blockchain from the Antelope family (such as Telos). It also offers functionality to retrieve the current status of the block producer, including the number of votes, percentage of total votes, and ranking position.

To use the library, the developer only needs to create an instance of the `Vote4Us` class, passing parameters that specify the block producer’s name along with additional parameters that identify the blockchain where the producer is a candidate. Optionally, you can include a list of suggested and not suggested block producers, as shown in the following example:

```ts
// Configuration for Vote4Us instance
const config: Vote4UsConfig = {
    currentProducer: 'producername',
    suggestedBPs: [
        'suggestedbp1',
        'suggestedbp2',
        'suggestedbp3',
        'suggestedbp4',
        'suggestedbp5',
        'suggestedbp6',
    ],
    notSuggestedBPs: [
        'notsuggested',
    ],
    rpcEndpoint: 'https://mainnet.telos.net',
    chainId: '4667b205c6838ef70ff7988f6e8257e8be0e1284a2f59699054a018f743b1d11',
    expectedBPs: 160,
};

// Create an instance of Vote4Us
const vote4us = new Vote4Us(config);
```

### Explanation of Each Parameter
- **currentProducer**: The account name of the block producer that you want to promote and gather votes for.
- **suggestedBPs**: If the user has space to vote for more block producers, suggestions from this list will be added (with the user consent) until the maximum of 30 block producers is reached.
- **notSuggestedBPs**: If the user has remaining slots available to vote for more block producers, active producers will be randomly selected and added, excluding those in this list.
- **rpcEndpoint**: The RPC endpoint of the network where the block producer is a candidate.
- **chainId**: The chain ID of the blockchain you are interacting with.
- **expectedBPs**: Sometimes the list of producers may be incomplete due to truncation. This parameter ensures that the query is repeated as many times as necessary until a minimum of `expectedBPs` producers is retrieved.



### Open de dialog
```ts
vote4us.openDialog();
```

### Check current status
```ts
console.log(vote4us.state.rank);        // (number) current position in the rank of active producers
console.log(vote4us.state.votes);       // (number) total votes for the current producer
console.log(vote4us.state.percentage);  // (string) readable string containing the percentage of votes over total votes
```

### Subscribe for changes
```ts
vote4us.change.subscribe((state: Vote4UsState) => {
    // ...
});
```

### Interfaces
```ts
export interface LoggedAccount {
    name: string;
    permission: string;
    user: Session;
}

export interface Statics {
    rank: number;
    votes: number;
    totalVotes: number;
    percentage: string;
    list: string[];
}

export type BlockProducers = string[];
export interface Vote4UsConfig {
    appName?: string;
    currentProducer: string;
    suggestedBPs: string[];
    notSuggestedBPs: string[];
    rpcEndpoint: string;
    chainId: string;
    expectedBPs: number;
}

export interface Vote4UsState {
    originalBPSelection: BlockProducers;
    modifiedBPSelection: BlockProducers;
    roomForMoreBPs: number;
    logged: LoggedAccount | null;
    currentProducerStatics: Statics;
    showDialog: boolean;
    thanks: boolean;
    hasVotedForUs: boolean;
    addRecommendedBPs: boolean;
    error: string;
}
```












### Build the Library

```bash
nvm install v20.12.2
nvm use v20.12.2
npm i
npm run build
```
