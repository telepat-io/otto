# Changelog

## [0.14.0](https://github.com/telepat-io/otto/compare/v0.13.0...v0.14.0) (2026-05-14)


### Features

* add LinkedIn commands for login checks ([102874b](https://github.com/telepat-io/otto/commit/102874b8ae671210a0fd6710966e5dcf9dc9de81))
* add skill for command authoring and debugging ([cd682a4](https://github.com/telepat-io/otto/commit/cd682a47248c78a1e5950fb096304642ca2bcf01))
* enhance `otto status` command to include connected node IDs and JSON output ([57c928c](https://github.com/telepat-io/otto/commit/57c928c0e49dfa84328b6e4d168f09a13bb3a80b))

## [0.13.0](https://github.com/telepat-io/otto/compare/v0.12.0...v0.13.0) (2026-05-04)


### Features

* add comprehensive guide for implementing a custom controller client against the Otto relay ([c68ef2f](https://github.com/telepat-io/otto/commit/c68ef2f6563184267cd4c6081868de1d7c5643ad))


### Bug Fixes

* update default log directory to user home for better accessibility ([ae58076](https://github.com/telepat-io/otto/commit/ae58076031032112bce84c3c7db6a1f88da7539a))

## [0.12.0](https://github.com/telepat-io/otto/compare/v0.11.0...v0.12.0) (2026-05-03)


### Features

* add SDK category to sidebars configuration ([c6e0450](https://github.com/telepat-io/otto/commit/c6e04507807378d4588510e21836e4ed6f4ca002))


### Bug Fixes

* remove default value for CSS selector option in command line interface ([1f4fbcd](https://github.com/telepat-io/otto/commit/1f4fbcd0c8f3ba774d2ace23b91886e11c7269fa))

## [0.11.0](https://github.com/telepat-io/otto/compare/v0.10.0...v0.11.0) (2026-05-03)


### Features

* add --json option to commands for JSON output and update related tests ([d19a375](https://github.com/telepat-io/otto/commit/d19a375d2e3e74315fff49ed64327e4844250f0e))
* add extract-content command for page content extraction ([f8992d1](https://github.com/telepat-io/otto/commit/f8992d1e70392ea7c2af46b5ea132beab1497c2c))


### Bug Fixes

* add ignore comments for keytar loading failures in client secret functions ([2678475](https://github.com/telepat-io/otto/commit/2678475215cb51f3591a437507677ac38447e47c))
* add platform-specific paths for Claude Desktop, Gemini, and Codex configurations ([aed176a](https://github.com/telepat-io/otto/commit/aed176ab21a96edf5e03afa964ffbbd5effaeeb5))
* adjust indentation for platform-specific config path comments in install.ts ([db47a4c](https://github.com/telepat-io/otto/commit/db47a4c2cadc3c07f965ce0f939241768ca714e3))
* update ignore comments for platform-specific config paths in install.ts ([28534e7](https://github.com/telepat-io/otto/commit/28534e77416643361b96dfd2260be9880301b51f))
* update Node.js version in CI workflow and enhance resolveControllerRegistrationMetadata to support custom prompt callback ([5e86d8b](https://github.com/telepat-io/otto/commit/5e86d8bebbdd5d0ef00c6d594f6a1a289e168602))
* update version mismatch message to reflect correct update command for relay daemon ([d85dbeb](https://github.com/telepat-io/otto/commit/d85dbeb3ec5eb83c13208ecc7557a371b375d800))
* version mismatch handling in onboarding state with specific labels and details ([4f7920c](https://github.com/telepat-io/otto/commit/4f7920ca0dacd76707848a49d0a265b9966419e3))

## [0.10.0](https://github.com/telepat-io/otto/compare/v0.9.0...v0.10.0) (2026-05-02)


### Features

* Implement Otto SDK client with WebSocket and HTTP support ([980bd0b](https://github.com/telepat-io/otto/commit/980bd0be6f5d2fad70e733da6082eeb69ab2b2e3))

## [0.9.0](https://github.com/telepat-io/otto/compare/v0.8.5...v0.9.0) (2026-04-30)


### Features

* add new icon images for extension in various sizes ([b366d94](https://github.com/telepat-io/otto/commit/b366d94ce23b322b0d7c9750e6ecd9b6386f7b49))
* add otto mcp and skill ([74c1909](https://github.com/telepat-io/otto/commit/74c1909756fa358bb91cb3b7f9fcae46eba1d5dd))
* add unit tests for various utility functions and schemas ([0f269ff](https://github.com/telepat-io/otto/commit/0f269ffc9145afb552c9e92cffc985490bfe4042))


### Bug Fixes

* **ci:** remove spurious publish trigger on every push to main ([59393c1](https://github.com/telepat-io/otto/commit/59393c15928daca40126f346471e73c5ab8468a2))

## [0.8.5](https://github.com/telepat-io/otto/compare/v0.8.4...v0.8.5) (2026-04-28)


### Bug Fixes

* determine-release-tag falls back to manifest version when release-please skips creation ([64076fa](https://github.com/telepat-io/otto/commit/64076fa6809c4e3e69186e011e3fabc72ddb73fe))
* use gh release create for tag creation instead of git tag in reconcile ([84e5a9a](https://github.com/telepat-io/otto/commit/84e5a9a56b835990ce19deda1c7f804b9aed7411))

## [0.8.4](https://github.com/telepat-io/otto/compare/v0.8.3...v0.8.4) (2026-04-28)


### Bug Fixes

* extract version from release PR body when title lacks semver ([e74121d](https://github.com/telepat-io/otto/commit/e74121d39dcd23690e777c8a9214c03a58feed6e))

## [0.8.3](https://github.com/telepat-io/otto/compare/v0.8.2...v0.8.3) (2026-04-28)


### Bug Fixes

* add release reconciliation step to ensure merged release PRs always get tagged ([ce8588c](https://github.com/telepat-io/otto/commit/ce8588cce880f24b3b5aa963dd05013a718e2c60))
* use heredoc loop in reconcile step to preserve GITHUB_OUTPUT ([ac8c118](https://github.com/telepat-io/otto/commit/ac8c118e293c583e1262dac62aa494892f59f62f))

## [0.8.2](https://github.com/telepat-io/otto/compare/v0.8.1...v0.8.2) (2026-04-28)


### Bug Fixes

* read CLI version from package.json instead of hardcoded 0.2.0 ([c91a703](https://github.com/telepat-io/otto/commit/c91a7030dcaea8d343c76c2a638ec8b86fedabf5))

## [0.8.1](https://github.com/telepat-io/otto/compare/v0.8.0...v0.8.1) (2026-04-28)


### Bug Fixes

* add internal dep versions to extra-files and use npm install in release jobs ([b7de6f7](https://github.com/telepat-io/otto/commit/b7de6f76db24cf8a3e7a366b196309201d6388fc))
* trim leading whitespace in README ([65df894](https://github.com/telepat-io/otto/commit/65df89440eb07d2af58a503345221795bc9ae3f5))

## [0.8.0](https://github.com/telepat-io/otto/compare/v0.7.0...v0.8.0) (2026-04-28)


### Features

* add commentOnPost command for Reddit to submit top-level comments ([e9f5fe6](https://github.com/telepat-io/otto/commit/e9f5fe6a5d845ae5c96d1145835c7705e6717f83))
* add Google site commands for login and search results ([ac51468](https://github.com/telepat-io/otto/commit/ac51468f8da01848a2fed2088edb3de0c1641b3e))
* add onboarding state management with relay connection handling ([65f3ec6](https://github.com/telepat-io/otto/commit/65f3ec62e79b641fd73a99cd7861e8324f76269c))
* add page screenshot functionality with CLI support and update related documentation ([0395835](https://github.com/telepat-io/otto/commit/0395835ca809fbb02877d49bd0de4bbac4fdaf6a))
* **cli:** enhance `otto test` command output; add JSON option for detailed stream data ([595a913](https://github.com/telepat-io/otto/commit/595a913dec5eb0320f2b07f3fa7f4b99034e08e0))
* **cli:** implement client secret management and authentication retry logic ([54b1838](https://github.com/telepat-io/otto/commit/54b1838e47def4eb7450c6fa46dfa79335bf4376))
* **cli:** update protocol and testing documentation; enhance websocket management in command execution ([08e57e9](https://github.com/telepat-io/otto/commit/08e57e9c058541e7d0a0c738fccf6e41f64f6ed5))
* enhance CLI onboarding and error handling with improved controller identity management and socket closure alerts ([9785bae](https://github.com/telepat-io/otto/commit/9785bae5dea75ecc916abf96cb96443974b0dcb0))
* enhance command execution with preload host readiness checks and debugging support ([dad7909](https://github.com/telepat-io/otto/commit/dad790960e616a52c5796302139de6321ba1a934))
* enhance comment submission process in Reddit post command with improved textbox handling and error diagnostics ([38f9aac](https://github.com/telepat-io/otto/commit/38f9aac735972b63f67720ab866ed39dede54bfb))
* enhance error handling in commentOnPost command with serialized in-page error surfacing ([32ec669](https://github.com/telepat-io/otto/commit/32ec669572586a5d49bf78ea9d70e46106cc34d4))
* enhance getFeed command with minReturnedPosts input and pagination support ([e2b99a0](https://github.com/telepat-io/otto/commit/e2b99a077788defe462af07a6d501c7169b885d5))
* enhance getUserInfo command with user profile normalization and fallback to logged-in user ([319bfe3](https://github.com/telepat-io/otto/commit/319bfe39e7913d14fd1b74ba3b60bac819c1ff68))
* enhance logging capabilities with JSON output and structured log entries ([b2d8d44](https://github.com/telepat-io/otto/commit/b2d8d446f5e965cd0b3b96fc9ebbaa8310af9c3a))
* enhance offscreen client logging with queuing and flushing mechanism ([699e6ee](https://github.com/telepat-io/otto/commit/699e6ee1d3d10821535ec1c1bb9bb368854e50a8))
* enhance Reddit commands with post and comment handling ([6d50685](https://github.com/telepat-io/otto/commit/6d50685a3dea3e70610fe571dd9cdc084493ab22))
* enhance relay functionality with new configuration and context management ([f17eafd](https://github.com/telepat-io/otto/commit/f17eafd171102d04c4cda17e22f35e6a2285a839))
* enhance sendChatMessage command with input normalization, error handling, and logging improvements ([f3edfd3](https://github.com/telepat-io/otto/commit/f3edfd33151a8fc08a3c1892a00a53ebc7069d18))
* enhance tab URL handling in recipe execution ([c08ec9f](https://github.com/telepat-io/otto/commit/c08ec9f1cf7c854c86d9b6461baf6cc44ac16190))
* implement controller heartbeat management; enhance websocket connection stability and timeout handling ([a4c04f5](https://github.com/telepat-io/otto/commit/a4c04f51cd6525d3a675a96d0ddf9abee2d6d553))
* implement day-windowed JSONL log storage with size-based spillover ([9a8b5db](https://github.com/telepat-io/otto/commit/9a8b5dbd00bfe22593557d981db172e5798f67bc))
* implement debugger focus emulation for commands ([a3c1e8c](https://github.com/telepat-io/otto/commit/a3c1e8cd5e939c002c623ad719d46a54c5f02d85))
* implement queued updates for Reddit stream processing with batching and scheduling ([2b39201](https://github.com/telepat-io/otto/commit/2b3920160ec706450bb063a1bfadaf4435263bd4))
* implement Reddit chat listener with network interception and polling fallback ([11acfb8](https://github.com/telepat-io/otto/commit/11acfb8c254160e39421aa5093edc5019f42fc74))
* implement WebSocket relay handling with lifecycle and non-command routes ([5944f95](https://github.com/telepat-io/otto/commit/5944f95af7d69708d0a0ad8d97bc542fbe6d2cca))
* improve post URL collection by targeting the main content area on Reddit ([55ee296](https://github.com/telepat-io/otto/commit/55ee2968013bb90746376a29199b8a179dc7f33b))
* include relay runtime dependencies in CLI package and update documentation ([1ef0409](https://github.com/telepat-io/otto/commit/1ef04092a6cd75bfe7e9ae0dd18c3bbbf1407ba8))
* initial commit ([faec294](https://github.com/telepat-io/otto/commit/faec29461e788a46c091128c3f0c206985b6b9bb))
* initialize Docusaurus website with essential configuration and assets ([13f6fff](https://github.com/telepat-io/otto/commit/13f6fff2a3c1b5475a31ac494f08b6a4c78998bc))
* page markdown extraction ([6d80258](https://github.com/telepat-io/otto/commit/6d80258a48b7be61f06f74dcdf72fb337a8f858d))
* **reddit:** enhance chat listener and renderer for improved message handling and user identification ([fa3b00d](https://github.com/telepat-io/otto/commit/fa3b00d6f0a644598c4cefd8e386a0778c046e3d))
* **reddit:** enhance getChatMessages recipe to support hybrid mode and improved message extraction ([6655067](https://github.com/telepat-io/otto/commit/66550670e9decb71239766bc35e23be022fa4ab6))
* **reddit:** implement chat stream functionality with event mapping and parsing ([00b7fcc](https://github.com/telepat-io/otto/commit/00b7fcc34138d93844afad8ca8e647b971a2e4b5))
* refactor code structure for improved readability and maintainability ([577ee16](https://github.com/telepat-io/otto/commit/577ee16ce43dfb1ceb41a0e27a4a7f92d702a57b))
* remove onboarding UI and related files; implement listener subscription and unsubscription commands ([1e2b630](https://github.com/telepat-io/otto/commit/1e2b6302c2210765f883903aff8b96a2bcc97baf))
* simplify sendChatMessage command by removing retry logic and enhancing textarea selection ([7afe4f8](https://github.com/telepat-io/otto/commit/7afe4f879441b5d14c8a89d55673c7d9410d2d60))
* update documentation with latest last updated dates and enhance command testing guidance for Shadow DOM helpers ([0022a5c](https://github.com/telepat-io/otto/commit/0022a5c64847b2c8a86dbda639ca99cf84f65438))
* update package versions and enhance release management for extension ([0351790](https://github.com/telepat-io/otto/commit/0351790c93993a5148308eb6a2cdada0f78e7425))
* update project title for clarity in README ([deaf1d6](https://github.com/telepat-io/otto/commit/deaf1d67bd2108e835c9279b2692cdece153ecf2))
* update setup and extension management to support version checks ([e9d67b1](https://github.com/telepat-io/otto/commit/e9d67b1a3d0b83a499492c182f2bf1cf6a6558dc))


### Bug Fixes

* add build step for shared protocol in release workflow ([d2d06ee](https://github.com/telepat-io/otto/commit/d2d06ee018a0b2813b6c3c334b2de14568b02aba))
* collapse release config to single component with extra-files version sync ([26cbeb9](https://github.com/telepat-io/otto/commit/26cbeb95cfa896a2f8910288ccab16959ea52437))
* correct indentation for cache settings in CI workflows ([da1445a](https://github.com/telepat-io/otto/commit/da1445a3e1badc79ff95525545cdab700f69d650))
* correct quotation marks in version mismatch detail message ([a35e764](https://github.com/telepat-io/otto/commit/a35e7643067be9343b9b0c43e3e5c6812e1e955e))
* move release component to repo root for cross-directory extra-files ([c2d3396](https://github.com/telepat-io/otto/commit/c2d3396f661e679b9900c99be0e61bcf08a3ee1f))
* remove unnecessary eslint disable comment for explicit any type ([f4cdb7f](https://github.com/telepat-io/otto/commit/f4cdb7f1ec85d1e190fa90164b4dbee45c2b32e9))
* standardize indentation for Node.js setup in CI workflows ([728204c](https://github.com/telepat-io/otto/commit/728204cf872b280b07d75627b9c8d1fa0e91f24e))
* sync CLI version and decouple extension asset upload from npm publish ([a20537a](https://github.com/telepat-io/otto/commit/a20537a209b5d26e80854a05bdfbff74a4943779))
* tolerate package version skew in release validation ([9a6bade](https://github.com/telepat-io/otto/commit/9a6bade32af0c2688a180a280353939016b0b693))
* update CLI version to 0.4.0 and align changelog ([4a0ad10](https://github.com/telepat-io/otto/commit/4a0ad10d81ebbaffcd2659d535a804ae976a072e))
* use relative paths for extra-files in release config ([c168f49](https://github.com/telepat-io/otto/commit/c168f49b1b4ff34a173752bafad1a947e05aa64c))
