# Preview Environments — Test proposed changes in a disposable copy of your production environment.


> Preview environments require a [*Professional* plan](professional-features) or higher.

It is critical to have testing and staging environments accurately reflect production, but achieving this can be a major operational hassle. Most engineering teams use a single staging environment which makes it hard for developers to test their changes in isolation; the alternative is for devops teams to spin up new testing or staging environments manually and tear them down after testing is done.

Render's *preview environments* solve this problem by automatically creating a fresh copy of your production environment (including services, databases, and environment groups) on every pull request, so you can test your changes with confidence without affecting staging or relying on devops teams to create and destroy infrastructure.

> A preview environment creates new instances of the services and datastores defined in your Blueprint. These instances do not copy any data from existing services. If you need to run any initial setup (such as seeding a database) you can use [Preview Environment Initialization](#preview-environment-initialization).

Render keeps your preview environments up to date on every commit and automatically destroys them when the original pull request is merged or closed. You can also set up an expiry time to automatically clean up preview environments after a period of inactivity.

Preview environments can be helpful in a lot of cases:

- Share your changes live in code reviews: no more Git diffs for visual changes!
- Get shareable links for upcoming features and collaborate more effectively with internal and external stakeholders.
- Run CI tests against a high fidelity copy of your production environment before merging.

## Getting started

1. Make sure your resources are defined in a YAML file configured as a Blueprint in the [Render Dashboard](https://dashboard.render.com).
    - By default, Render creates a Blueprint using the `render.yaml` file at your repository's root. You can specify a custom file path in the Render Dashboard. For details, see [Render Blueprints](infrastructure-as-code).

2. To enable preview environments for a Blueprint, set the `previews.generation` key to one of `manual` or `automatic` in your YAML file:

   ```yaml{1-2}
   previews:
     generation: automatic
   services:
   - type: web
   ...
   ```

   For details on each option, see [Manual vs. automatic preview environments](#manual-vs-automatic-preview-environments).

> Setting the deprecated field `previewsEnabled: true` is equivalent to setting this field to `automatic`.

3. Merge your changes to your Blueprint's linked branch.

You're all set! Open a new pull request in your repository and see your preview environment deploy with status updates right in the pull request. You can visit the URL for your preview environment by clicking *View deployment* next to your web service deployment.

[image: preview environment deployment]

> As of this writing, GitLab does not support status updates on merge requests.

If you'd like to try this for yourself, fork our [Preview Environments example repository](https://github.com/render-examples/preview-environment), synchronize the `render.yaml` file [in your dashboard](https://dashboard.render.com/blueprints), and open a new pull request.

> If you explicitly set a `branch` for your services in `render.yaml` then that would be used to deploy a preview environment as well which may not be expected behavior. Typically, if you're using preview environments you don't need to specify a branch as we would use the branch the blueprint was created for initially and then the branch the pull request is against to create the preview environment.

### Manual vs. automatic preview environments

------

###### Preview Mode

*Manual*

###### Description

By default, Render does _not_ create preview environments for PRs. To create a preview environment for a specific PR, include the string `[render preview]` in your PR's _title_ (not the commit message): ```
[render preview] Update homepage
``` You can also edit an _existing_ PR's title to add or remove `[render preview]`. If you do, Render provisions or deletes associated preview instances accordingly.

---

###### Preview Mode

*Automatic*

###### Description

By default, Render creates a preview environment for _every_ PR against your Blueprint's linked branch. To skip creating a preview environment for a specific PR, include any of the following strings in your PR's _title_ (not the commit message):

- `[skip preview]`
- `[skip render]`
- `[preview skip]`
- `[render skip]`

You can also edit an _existing_ PR's title to add or remove one of these strings. If you do, Render provisions or deletes associated preview instances accordingly. 
> Your pull request's title might be included in the message for its associated merge commit. If you use `[skip render]` or `[render skip]`, this also [skips the auto-deploy](/deploys#skipping-an-auto-deploy) for the service when merged. To avoid this, instead use `[skip preview]` or `[preview skip]`.

------

### Override preview instance types

Services in a preview environment can use a different instance type from their production counterparts. By using smaller instance types for preview environments, you can reduce costs.

- For Render Postgres and Key Value instances, set the `previewPlan` field.
- For all other service types, set the `previews.plan` field.

> If your Render Postgres database uses a new [flexible plan](postgresql-refresh), you cannot specify a _non_-flexible instance type for its `previewPlan` (or vice versa). [See supported values.](blueprint-spec#plan-1)

See example `render.yaml` declarations below. For all supported values, see the [Blueprint YAML Reference](blueprint-spec#plan).

If you don't specify a preview instance type for a service, Render uses the same instance type that you use in production.

```yaml
previews:
  generation: automatic
services:
  - type: web
    plan: standard
    previews: # highlight-line
      plan: starter # highlight-line
    name: express-server
    runtime: node
  - type: keyvalue
    plan: standard
    previewPlan: starter # highlight-line
    name: private cache
    ipAllowList: [] # only allow internal connections
databases:
  - name: my_test_db
    plan: pro-4gb
    previewPlan: basic-1gb # highlight-line
    previewDiskSizeGB: 5 # highlight-line
```

### Override number of preview instances

Web services, private services, and background workers in a preview environment can use a different number of instances from their production counterparts. By using fewer instance types for preview environments, you can reduce costs.

See example `render.yaml` declarations below. For all supported values, see the [Blueprint YAML Reference](blueprint-spec#plan).

If you don't specify a preview number of instances for a service, Render uses the same number of instances that you use in production. If autoscaling is configured, Render uses the minimum number of instances.

```yaml
previews:
  generation: automatic
services:
  - type: web
    plan: standard
    numInstances: 7
    previews: # highlight-line
      numInstances: 6 # highlight-line
    name: express-server
    runtime: node
  - type: web
    plan: standard
    scaling:
      minInstances: 2
      maxInstances: 10
      targetCPUPercent: 70
    previews: # highlight-line
      numInstances: 6 # highlight-line
    name: autoscaling-express-server
    runtime: node
```

### Environment variables

You can override environment variables in preview environments with `previewValue`. This can be useful if you need to override a production API key with a test key, or if you'd like to use a single database across all preview environments. Environment variable overrides are supported for web services, private services, and [environment groups](blueprint-spec#environment-groups).

```yaml
previews:
  generation: automatic
services:
  - type: web
    plan: standard
    name: express-server
    runtime: node
    envVars:
      - key: MY_API_KEY
        value: production-api-key
        previewValue: test-api-key # highlight-line
```

#### Placeholder environment variables

[Placeholder environment variables](blueprint-spec#prompting-for-secret-values) defined with `sync: false` are not copied to preview environments. To share secret variables across preview environments:

1. Manually create an environment group in the [Dashboard](https://dashboard.render.com/new/env-group).
2. Add one or more environment variables.
3. Reference the environment group in your `render.yaml` file, as needed.

```yaml
previews:
  generation: automatic
services:
  - type: web
    plan: standard
    name: express-server
    runtime: node
    envVars:
      # The value for `MY_API_KEY` provided in the Dashboard will *not* be
      # copied to preview environments.
      - key: MY_API_KEY
        sync: false

      # Any values in this group will be copied to preview environments,
      # if `all-settings` exists and is *not* included in this file.
      - fromGroup: all-settings # highlight-line
```

> You can also use an environment group that’s managed by a Blueprint, if it’s not the same Blueprint that you’re using to manage your preview environments.
>
> If you use the same Blueprint for both, a new environment group will be created for each preview environment. Placeholder environment variables will not be copied to these environment groups.

### Preview environment initialization

You may want to run custom initialization for your preview environment after it is created but not on subsequent deploys, for example to seed a newly created database or download files to disk. You can do this by specifying a command to run after the first successful deploy with `initialDeployHook`.

```yaml
previews:
  generation: automatic
services:
  - type: web
    plan: standard
    name: express-server
    runtime: node
    initialDeployHook: ./seed_database.sh # highlight-line
```

### Automatic expiration

You can set the number of days a preview environment can exist without any new commits to help manage costs. Set `previews.expireAfterDays` to automatically delete the environment after the specified number of days of inactivity. The default is no expiry. The expiration time is reset with every push to the preview environment.

```yaml
previews:
  generation: automatic
  expireAfterDays: 3 # highlight-line
services:
  - type: web
    plan: standard
    name: express-server
    runtime: node
```

## Root directory and build filters

If you [define the Root Directory or specify Build Filters](monorepo-support) for each service in your Blueprint Spec, Render will only create a preview environment if the files changed in a pull request match the Root Directory or Build Filter paths for at least one service.

## Preview environment billing

Preview resources are billed just like regular Render services and are prorated by the second. See [Render Pricing](/pricing) for service and instance type details.
