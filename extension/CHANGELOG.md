# Changelog

## [0.5.0](https://github.com/telepat-io/otto/compare/extension-v0.4.0...extension-v0.5.0) (2026-04-26)


### Features

* add page screenshot functionality with CLI support and update related documentation ([0395835](https://github.com/telepat-io/otto/commit/0395835ca809fbb02877d49bd0de4bbac4fdaf6a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @telepat/otto-protocol bumped from 0.4.0 to 0.5.0

## [0.4.0](https://github.com/telepat-io/otto/compare/extension-v0.3.0...extension-v0.4.0) (2026-04-23)


### Features

* page markdown extraction ([6d80258](https://github.com/telepat-io/otto/commit/6d80258a48b7be61f06f74dcdf72fb337a8f858d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @telepat/otto-protocol bumped from 0.3.0 to 0.4.0

## [0.3.0](https://github.com/telepat-io/otto/compare/extension-v0.1.0...extension-v0.3.0) (2026-04-21)


### Features

* add commentOnPost command for Reddit to submit top-level comments ([e9f5fe6](https://github.com/telepat-io/otto/commit/e9f5fe6a5d845ae5c96d1145835c7705e6717f83))
* add onboarding state management with relay connection handling ([65f3ec6](https://github.com/telepat-io/otto/commit/65f3ec62e79b641fd73a99cd7861e8324f76269c))
* **cli:** implement client secret management and authentication retry logic ([54b1838](https://github.com/telepat-io/otto/commit/54b1838e47def4eb7450c6fa46dfa79335bf4376))
* enhance command execution with preload host readiness checks and debugging support ([dad7909](https://github.com/telepat-io/otto/commit/dad790960e616a52c5796302139de6321ba1a934))
* enhance comment submission process in Reddit post command with improved textbox handling and error diagnostics ([38f9aac](https://github.com/telepat-io/otto/commit/38f9aac735972b63f67720ab866ed39dede54bfb))
* enhance error handling in commentOnPost command with serialized in-page error surfacing ([32ec669](https://github.com/telepat-io/otto/commit/32ec669572586a5d49bf78ea9d70e46106cc34d4))
* enhance getFeed command with minReturnedPosts input and pagination support ([e2b99a0](https://github.com/telepat-io/otto/commit/e2b99a077788defe462af07a6d501c7169b885d5))
* enhance getUserInfo command with user profile normalization and fallback to logged-in user ([319bfe3](https://github.com/telepat-io/otto/commit/319bfe39e7913d14fd1b74ba3b60bac819c1ff68))
* enhance offscreen client logging with queuing and flushing mechanism ([699e6ee](https://github.com/telepat-io/otto/commit/699e6ee1d3d10821535ec1c1bb9bb368854e50a8))
* enhance Reddit commands with post and comment handling ([6d50685](https://github.com/telepat-io/otto/commit/6d50685a3dea3e70610fe571dd9cdc084493ab22))
* enhance sendChatMessage command with input normalization, error handling, and logging improvements ([f3edfd3](https://github.com/telepat-io/otto/commit/f3edfd33151a8fc08a3c1892a00a53ebc7069d18))
* enhance tab URL handling in recipe execution ([c08ec9f](https://github.com/telepat-io/otto/commit/c08ec9f1cf7c854c86d9b6461baf6cc44ac16190))
* implement debugger focus emulation for commands ([a3c1e8c](https://github.com/telepat-io/otto/commit/a3c1e8cd5e939c002c623ad719d46a54c5f02d85))
* implement queued updates for Reddit stream processing with batching and scheduling ([2b39201](https://github.com/telepat-io/otto/commit/2b3920160ec706450bb063a1bfadaf4435263bd4))
* implement Reddit chat listener with network interception and polling fallback ([11acfb8](https://github.com/telepat-io/otto/commit/11acfb8c254160e39421aa5093edc5019f42fc74))
* implement WebSocket relay handling with lifecycle and non-command routes ([5944f95](https://github.com/telepat-io/otto/commit/5944f95af7d69708d0a0ad8d97bc542fbe6d2cca))
* improve post URL collection by targeting the main content area on Reddit ([55ee296](https://github.com/telepat-io/otto/commit/55ee2968013bb90746376a29199b8a179dc7f33b))
* initial commit ([faec294](https://github.com/telepat-io/otto/commit/faec29461e788a46c091128c3f0c206985b6b9bb))
* **reddit:** enhance chat listener and renderer for improved message handling and user identification ([fa3b00d](https://github.com/telepat-io/otto/commit/fa3b00d6f0a644598c4cefd8e386a0778c046e3d))
* **reddit:** enhance getChatMessages recipe to support hybrid mode and improved message extraction ([6655067](https://github.com/telepat-io/otto/commit/66550670e9decb71239766bc35e23be022fa4ab6))
* **reddit:** implement chat stream functionality with event mapping and parsing ([00b7fcc](https://github.com/telepat-io/otto/commit/00b7fcc34138d93844afad8ca8e647b971a2e4b5))
* remove onboarding UI and related files; implement listener subscription and unsubscription commands ([1e2b630](https://github.com/telepat-io/otto/commit/1e2b6302c2210765f883903aff8b96a2bcc97baf))
* simplify sendChatMessage command by removing retry logic and enhancing textarea selection ([7afe4f8](https://github.com/telepat-io/otto/commit/7afe4f879441b5d14c8a89d55673c7d9410d2d60))
* update package versions and enhance release management for extension ([0351790](https://github.com/telepat-io/otto/commit/0351790c93993a5148308eb6a2cdada0f78e7425))
* update setup and extension management to support version checks ([e9d67b1](https://github.com/telepat-io/otto/commit/e9d67b1a3d0b83a499492c182f2bf1cf6a6558dc))


### Bug Fixes

* correct quotation marks in version mismatch detail message ([a35e764](https://github.com/telepat-io/otto/commit/a35e7643067be9343b9b0c43e3e5c6812e1e955e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @telepat/otto-protocol bumped from 0.2.0 to 0.3.0
