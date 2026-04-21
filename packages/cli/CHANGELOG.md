# Changelog

## [0.3.0](https://github.com/telepat-io/otto/compare/v0.2.0...v0.3.0) (2026-04-21)


### Features

* update setup and extension management to support version checks ([e9d67b1](https://github.com/telepat-io/otto/commit/e9d67b1a3d0b83a499492c182f2bf1cf6a6558dc))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @telepat/otto-protocol bumped from 0.2.0 to 0.3.0
    * @telepat/otto-relay bumped from 0.2.0 to 0.3.0

## [0.2.0](https://github.com/telepat-io/otto/compare/v0.1.0...v0.2.0) (2026-04-21)


### Features

* **cli:** enhance `otto test` command output; add JSON option for detailed stream data ([595a913](https://github.com/telepat-io/otto/commit/595a913dec5eb0320f2b07f3fa7f4b99034e08e0))
* **cli:** implement client secret management and authentication retry logic ([54b1838](https://github.com/telepat-io/otto/commit/54b1838e47def4eb7450c6fa46dfa79335bf4376))
* **cli:** update protocol and testing documentation; enhance websocket management in command execution ([08e57e9](https://github.com/telepat-io/otto/commit/08e57e9c058541e7d0a0c738fccf6e41f64f6ed5))
* enhance CLI onboarding and error handling with improved controller identity management and socket closure alerts ([9785bae](https://github.com/telepat-io/otto/commit/9785bae5dea75ecc916abf96cb96443974b0dcb0))
* enhance getFeed command with minReturnedPosts input and pagination support ([e2b99a0](https://github.com/telepat-io/otto/commit/e2b99a077788defe462af07a6d501c7169b885d5))
* enhance getUserInfo command with user profile normalization and fallback to logged-in user ([319bfe3](https://github.com/telepat-io/otto/commit/319bfe39e7913d14fd1b74ba3b60bac819c1ff68))
* enhance logging capabilities with JSON output and structured log entries ([b2d8d44](https://github.com/telepat-io/otto/commit/b2d8d446f5e965cd0b3b96fc9ebbaa8310af9c3a))
* enhance Reddit commands with post and comment handling ([6d50685](https://github.com/telepat-io/otto/commit/6d50685a3dea3e70610fe571dd9cdc084493ab22))
* enhance sendChatMessage command with input normalization, error handling, and logging improvements ([f3edfd3](https://github.com/telepat-io/otto/commit/f3edfd33151a8fc08a3c1892a00a53ebc7069d18))
* implement controller heartbeat management; enhance websocket connection stability and timeout handling ([a4c04f5](https://github.com/telepat-io/otto/commit/a4c04f51cd6525d3a675a96d0ddf9abee2d6d553))
* implement Reddit chat listener with network interception and polling fallback ([11acfb8](https://github.com/telepat-io/otto/commit/11acfb8c254160e39421aa5093edc5019f42fc74))
* implement WebSocket relay handling with lifecycle and non-command routes ([5944f95](https://github.com/telepat-io/otto/commit/5944f95af7d69708d0a0ad8d97bc542fbe6d2cca))
* include relay runtime dependencies in CLI package and update documentation ([1ef0409](https://github.com/telepat-io/otto/commit/1ef04092a6cd75bfe7e9ae0dd18c3bbbf1407ba8))
* initial commit ([faec294](https://github.com/telepat-io/otto/commit/faec29461e788a46c091128c3f0c206985b6b9bb))
* **reddit:** enhance chat listener and renderer for improved message handling and user identification ([fa3b00d](https://github.com/telepat-io/otto/commit/fa3b00d6f0a644598c4cefd8e386a0778c046e3d))
* **reddit:** implement chat stream functionality with event mapping and parsing ([00b7fcc](https://github.com/telepat-io/otto/commit/00b7fcc34138d93844afad8ca8e647b971a2e4b5))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @telepat/otto-protocol bumped from 0.1.0 to 0.2.0
    * @telepat/otto-relay bumped from 0.1.0 to 0.2.0
