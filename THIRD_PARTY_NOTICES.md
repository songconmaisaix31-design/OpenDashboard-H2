# Third-Party Notices

This inventory describes the H2 Sentinel candidate assembled on 2026-08-19.
Versions come from the committed `package-lock.json` and
`services/h2-analytics/uv.lock`. Dependencies are consumed through their
published packages; no upstream source file or asset was copied into H2-owned
source paths.

## Production Web runtime

| Package | Version | Role | License | Source |
| --- | --- | --- | --- | --- |
| Apache ECharts | 6.1.0 | H2 time-series and event charts | Apache-2.0; bundled d3-derived subcomponents under BSD-3-Clause | https://github.com/apache/echarts |
| React | 19.2.4 | Web component runtime | MIT | https://github.com/facebook/react |
| React DOM | 19.2.4 | Browser renderer | MIT | https://github.com/facebook/react |

The production bundle also contains these locked transitive packages:

| Package | Version | Parent | License | Source |
| --- | --- | --- | --- | --- |
| zrender | 6.1.0 | Apache ECharts | BSD-3-Clause | https://github.com/ecomfe/zrender |
| tslib | 2.3.0 | Apache ECharts / zrender | 0BSD | https://github.com/microsoft/tslib |
| scheduler | 0.27.0 | React DOM | MIT | https://github.com/facebook/react |

### Apache ECharts upstream NOTICE

> Apache ECharts<br>
> Copyright 2017-2026 The Apache Software Foundation<br>
> This product includes software developed at<br>
> The Apache Software Foundation (https://www.apache.org/).

Apache ECharts is licensed under the
[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). Its published
package identifies d3-derived subcomponents in `LICENSE` and provides the
following BSD-3-Clause license in `licenses/LICENSE-d3`.

### Apache ECharts d3-derived subcomponent license

Copyright 2010-2016 Mike Bostock
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

- Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.
- Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.
- Neither the name of the author nor the names of contributors may be used to
  endorse or promote products derived from this software without specific prior
  written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## Local analytics runtime

The launcher installs and runs the committed default analytics environment with
`uv sync --locked --extra dev`; the `dev` extra is used for verification, while
the runtime application directly depends on the following packages.

| Package | Locked version | Role | License | Source |
| --- | --- | --- | --- | --- |
| FastAPI | 0.141.1 | Loopback HTTP API | MIT | https://github.com/fastapi/fastapi |
| Jinja | 3.1.6 | Escaped HTML report template | BSD-3-Clause | https://github.com/pallets/jinja |
| Pydantic | 2.13.4 | Strict request validation | MIT | https://github.com/pydantic/pydantic |
| Uvicorn | 0.52.3 | Loopback ASGI server | BSD-3-Clause | https://github.com/Kludex/uvicorn |

## Development and test dependencies

These packages support type checking, builds, or verification and are not
presented as H2 product capabilities.

| Ecosystem | Package | Locked version | License |
| --- | --- | --- | --- |
| npm | @types/node | 24.13.3 | MIT |
| npm | @types/react | 19.2.18 | MIT |
| npm | @types/react-dom | 19.2.4 | MIT |
| npm | TypeScript | 6.0.3 | Apache-2.0 |
| npm | tsx | 4.21.0 | MIT |
| npm | Vite | 6.4.3 | MIT |
| Python | HTTPX | 0.28.1 | BSD-3-Clause |
| Python | jsonschema | 4.26.0 | MIT |
| Python | pytest | 9.1.1 | MIT |

## Optional dependency not shipped by the default path

`lightgbm` 4.7.0 is present only in the locked optional `ml` extra. The H2
launcher, default `uv sync --locked --extra dev`, deterministic rule fallback,
tests, and smokes do not install or require it. pandas and scikit-learn are not
declared H2 dependencies and are not included in this inventory.

Official competition datasets, model files, screenshots, and generated reports
are absent from the source candidate. Their license or authorization must be
reviewed separately before any later distribution.
